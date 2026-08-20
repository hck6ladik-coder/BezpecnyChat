import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { UserProfile, SecurityAuditEntry } from '../types/chat';
import { deriveKeccakAddress, bytesToHex, hexToBytes, keccak256Hex } from '../crypto/keccak';
import { deriveMasterKey } from '../crypto/kdf';
import {
  StoredPrekeys,
  UserPrekeyBundle,
  generateUserPrekeys,
  createPublicPrekeyBundle,
  x3dhInitiate,
  x3dhReceive,
} from '../crypto/x3dh';
import {
  RatchetState,
  initRatchetAsAlice,
  initRatchetAsBob,
} from '../crypto/ratchet';
import {
  SenderKeyState,
  createGroupSenderKey,
  processSenderKeyDistribution,
  SenderKeyDistributionMessage,
} from '../crypto/senderKey';
import { secureStorage } from '../crypto/storage';
import { verifyTotpCode, verifyBackupCode } from '../crypto/auth';

interface CryptoContextType {
  isInitialized: boolean;
  isUnlocked: boolean;
  profile: UserProfile | null;
  prekeys: StoredPrekeys | null;
  publicBundle: UserPrekeyBundle | null;
  auditLogs: SecurityAuditEntry[];
  
  createIdentity: (password: string, username: string) => Promise<UserProfile>;
  unlockVault: (password: string) => Promise<boolean>;
  lockVault: () => void;
  rotateKeys: () => Promise<void>;
  enable2FA: (secretHex: string, backupHashes: string[]) => Promise<void>;
  disable2FA: () => Promise<void>;
  verify2FA: (code: string) => Promise<boolean>;
  
  getOrCreateRatchetSession: (peerAddress: string, peerBundle?: UserPrekeyBundle) => Promise<RatchetState>;
  saveRatchetSession: (peerAddress: string, state: RatchetState) => Promise<void>;
  
  getGroupSenderKey: (groupId: string, senderAddress: string) => SenderKeyState | null;
  registerGroupSenderKey: (groupId: string, senderAddress: string, state: SenderKeyState) => void;
  createMyGroupSenderKey: (groupId: string) => { state: SenderKeyState; distMessage: SenderKeyDistributionMessage };
  
  addAuditLog: (entry: Omit<SecurityAuditEntry, 'id' | 'timestamp'>) => void;
  toggleTorRouting: () => void;
}

const CryptoContext = createContext<CryptoContextType | null>(null);

const STORAGE_KEY_PROFILE = 'user_profile';
const STORAGE_KEY_PREKEYS = 'user_prekeys';
const STORAGE_KEY_SALT = 'keccak_auth_salt';
const STORAGE_KEY_AUDIT = 'keccak_audit_logs';

export const CryptoProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [prekeys, setPrekeys] = useState<StoredPrekeys | null>(null);
  const [publicBundle, setPublicBundle] = useState<UserPrekeyBundle | null>(null);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditEntry[]>([]);
  
  // In-memory active ratchets and group keys
  const [ratchetSessions, setRatchetSessions] = useState<Map<string, RatchetState>>(new Map());
  const [groupSenderKeys, setGroupSenderKeys] = useState<Map<string, SenderKeyState>>(new Map());

  const addAuditLog = useCallback((entry: Omit<SecurityAuditEntry, 'id' | 'timestamp'>) => {
    const newLog: SecurityAuditEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    setAuditLogs((prev) => [newLog, ...prev.slice(0, 99)]);
  }, []);

  // Check if identity already exists on load
  useEffect(() => {
    const savedSalt = localStorage.getItem(STORAGE_KEY_SALT);
    if (savedSalt) {
      setIsInitialized(true);
    }
  }, []);

  const createIdentity = async (password: string, username: string): Promise<UserProfile> => {
    const { masterKey, saltHex } = await deriveMasterKey(password);
    localStorage.setItem(STORAGE_KEY_SALT, saltHex);

    secureStorage.unlock(masterKey);

    const generatedPrekeys = generateUserPrekeys(30);
    const address = deriveKeccakAddress(generatedPrekeys.identityKeyPair.publicKey);
    const bundle = createPublicPrekeyBundle(generatedPrekeys);

    const newProfile: UserProfile = {
      address,
      username: username.trim() || 'Anonymní Uživatel',
      bio: 'Používám šifrovanou komunikaci s KECCAK256 protokolem.',
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${address}`,
      identityKeyHex: generatedPrekeys.identityKeyPair.publicKeyHex,
      signingKeyHex: generatedPrekeys.signingKeyPair.publicKeyHex,
      has2FA: false,
      torRoutingEnabled: true,
      autoLockMinutes: 15,
      createdAt: Date.now(),
    };

    // Serialize prekeys map for storage
    const serializedPrekeys = {
      identityKeyPair: generatedPrekeys.identityKeyPair,
      signingKeyPair: generatedPrekeys.signingKeyPair,
      signedPrekeyPair: generatedPrekeys.signedPrekeyPair,
      oneTimePrekeyPairs: Array.from(generatedPrekeys.oneTimePrekeyPairs.entries()),
    };

    await secureStorage.saveEncryptedItem(STORAGE_KEY_PROFILE, newProfile);
    await secureStorage.saveEncryptedItem(STORAGE_KEY_PREKEYS, serializedPrekeys);

    setProfile(newProfile);
    setPrekeys(generatedPrekeys);
    setPublicBundle(bundle);
    setIsInitialized(true);
    setIsUnlocked(true);

    addAuditLog({
      type: 'key_rotation',
      title: 'Generována nová KECCAK256 E2EE identita',
      description: `Vytvořena adresa ${address} a vygenerováno 30 jednorázových prekeys.`,
      details: { address, identityKey: bundle.identityKeyHex },
      severity: 'security',
    });

    return newProfile;
  };

  const unlockVault = async (password: string): Promise<boolean> => {
    try {
      const saltHex = localStorage.getItem(STORAGE_KEY_SALT);
      if (!saltHex) return false;

      const { masterKey } = await deriveMasterKey(password, saltHex);
      secureStorage.unlock(masterKey);

      const loadedProfile = await secureStorage.getEncryptedItem<UserProfile>(STORAGE_KEY_PROFILE);
      const loadedPrekeysRaw = await secureStorage.getEncryptedItem<{
        identityKeyPair: StoredPrekeys['identityKeyPair'];
        signingKeyPair: StoredPrekeys['signingKeyPair'];
        signedPrekeyPair: StoredPrekeys['signedPrekeyPair'];
        oneTimePrekeyPairs: [string, StoredPrekeys['identityKeyPair']][];
      }>(STORAGE_KEY_PREKEYS);

      if (!loadedProfile || !loadedPrekeysRaw) {
        secureStorage.lock();
        return false;
      }

      const reconstructedPrekeys: StoredPrekeys = {
        identityKeyPair: loadedPrekeysRaw.identityKeyPair,
        signingKeyPair: loadedPrekeysRaw.signingKeyPair,
        signedPrekeyPair: loadedPrekeysRaw.signedPrekeyPair,
        oneTimePrekeyPairs: new Map(loadedPrekeysRaw.oneTimePrekeyPairs),
      };

      const bundle = createPublicPrekeyBundle(reconstructedPrekeys);

      setProfile(loadedProfile);
      setPrekeys(reconstructedPrekeys);
      setPublicBundle(bundle);
      setIsUnlocked(true);

      addAuditLog({
        type: 'handshake',
        title: 'Trezor úspěšně odemčen',
        description: 'Všechny kryptografické klíče byly načteny z paměti po PBKDF2 derivaci.',
        details: { address: loadedProfile.address },
        severity: 'success',
      });

      return true;
    } catch (err) {
      console.error('Failed to unlock vault:', err);
      secureStorage.lock();
      return false;
    }
  };

  const lockVault = () => {
    secureStorage.lock();
    setPrekeys(null);
    setPublicBundle(null);
    setRatchetSessions(new Map());
    setGroupSenderKeys(new Map());
    setIsUnlocked(false);

    addAuditLog({
      type: 'blocked_leak',
      title: 'Trezor uzamčen',
      description: 'Paměťové klíče a relace byly bezpečně vymazány z RAM.',
      details: {},
      severity: 'info',
    });
  };

  const rotateKeys = async () => {
    if (!prekeys || !profile) return;
    const newPrekeys = generateUserPrekeys(30);
    const bundle = createPublicPrekeyBundle(newPrekeys);

    const serializedPrekeys = {
      identityKeyPair: newPrekeys.identityKeyPair,
      signingKeyPair: newPrekeys.signingKeyPair,
      signedPrekeyPair: newPrekeys.signedPrekeyPair,
      oneTimePrekeyPairs: Array.from(newPrekeys.oneTimePrekeyPairs.entries()),
    };

    await secureStorage.saveEncryptedItem(STORAGE_KEY_PREKEYS, serializedPrekeys);
    setPrekeys(newPrekeys);
    setPublicBundle(bundle);

    addAuditLog({
      type: 'key_rotation',
      title: 'Rotace kryptografických prekeys',
      description: 'Vygenerována nová podepsaná prekey a 30 jednorázových OPK.',
      details: { signedPrekey: bundle.signedPrekeyHex },
      severity: 'security',
    });
  };

  const enable2FA = async (secretHex: string, backupHashes: string[]) => {
    if (!profile) return;
    const updated: UserProfile = {
      ...profile,
      has2FA: true,
      totpSecretHex: secretHex,
      backupCodeHashes: backupHashes,
    };
    await secureStorage.saveEncryptedItem(STORAGE_KEY_PROFILE, updated);
    setProfile(updated);

    addAuditLog({
      type: 'security',
      title: '2FA TOTP dvoufaktorová ochrana aktivována',
      description: 'Dvoufázové ověřování s KECCAK256 hashovanými záložními kódy aktivováno.',
      details: { backupCodesCount: backupHashes.length },
      severity: 'security',
    });
  };

  const disable2FA = async () => {
    if (!profile) return;
    const updated: UserProfile = {
      ...profile,
      has2FA: false,
      totpSecretHex: undefined,
      backupCodeHashes: undefined,
    };
    await secureStorage.saveEncryptedItem(STORAGE_KEY_PROFILE, updated);
    setProfile(updated);
  };

  const verify2FA = async (code: string): Promise<boolean> => {
    if (!profile || !profile.totpSecretHex) return true;
    const secretBytes = hexToBytes(profile.totpSecretHex);
    const isTotpValid = await verifyTotpCode(secretBytes, code);
    if (isTotpValid) return true;

    // Check backup codes
    if (profile.backupCodeHashes && profile.backupCodeHashes.length > 0) {
      const { isValid, remainingHashes } = verifyBackupCode(code, profile.backupCodeHashes);
      if (isValid) {
        const updated = { ...profile, backupCodeHashes: remainingHashes };
        await secureStorage.saveEncryptedItem(STORAGE_KEY_PROFILE, updated);
        setProfile(updated);
        return true;
      }
    }
    return false;
  };

  const getOrCreateRatchetSession = async (
    peerAddress: string,
    peerBundle?: UserPrekeyBundle
  ): Promise<RatchetState> => {
    if (ratchetSessions.has(peerAddress)) {
      return ratchetSessions.get(peerAddress)!;
    }

    // Try loading from encrypted vault
    const saved = await secureStorage.getEncryptedItem<RatchetState>(`ratchet_${peerAddress}`);
    if (saved) {
      ratchetSessions.set(peerAddress, saved);
      return saved;
    }

    if (!prekeys || !peerBundle) {
      throw new Error(`Nemáme ratchet relaci ani prekey bundle pro ${peerAddress}`);
    }

    // Initiate as Alice
    const x3dhResult = x3dhInitiate(prekeys.identityKeyPair, peerBundle);
    const bobSignedPrekey = hexToBytes(peerBundle.signedPrekeyHex);
    const newRatchet = initRatchetAsAlice(x3dhResult.sharedMasterKey, bobSignedPrekey);

    ratchetSessions.set(peerAddress, newRatchet);
    await secureStorage.saveEncryptedItem(`ratchet_${peerAddress}`, newRatchet);

    addAuditLog({
      type: 'handshake',
      title: `E2EE X3DH Handshake navázán s ${peerAddress.slice(0, 14)}...`,
      description: 'Zahájena Double Ratchet relace s Perfect Forward Secrecy.',
      details: {
        ephemeralKey: x3dhResult.ephemeralPublicKeyHex,
        opkUsed: x3dhResult.oneTimePrekeyUsedHex || 'Žádný',
      },
      severity: 'success',
    });

    return newRatchet;
  };

  const saveRatchetSession = async (peerAddress: string, state: RatchetState) => {
    ratchetSessions.set(peerAddress, state);
    await secureStorage.saveEncryptedItem(`ratchet_${peerAddress}`, state);
  };

  const getGroupSenderKey = (groupId: string, senderAddress: string): SenderKeyState | null => {
    const key = `${groupId}:${senderAddress}`;
    return groupSenderKeys.get(key) || null;
  };

  const registerGroupSenderKey = (groupId: string, senderAddress: string, state: SenderKeyState) => {
    const key = `${groupId}:${senderAddress}`;
    groupSenderKeys.set(key, state);
  };

  const createMyGroupSenderKey = (groupId: string) => {
    if (!profile) throw new Error('Profil není inicializován');
    const { state, distributionMessage } = createGroupSenderKey(groupId, profile.address);
    registerGroupSenderKey(groupId, profile.address, state);
    return { state, distMessage: distributionMessage };
  };

  const toggleTorRouting = () => {
    if (!profile) return;
    const updated = { ...profile, torRoutingEnabled: !profile.torRoutingEnabled };
    setProfile(updated);
    secureStorage.saveEncryptedItem(STORAGE_KEY_PROFILE, updated);
  };

  return (
    <CryptoContext.Provider
      value={{
        isInitialized,
        isUnlocked,
        profile,
        prekeys,
        publicBundle,
        auditLogs,
        createIdentity,
        unlockVault,
        lockVault,
        rotateKeys,
        enable2FA,
        disable2FA,
        verify2FA,
        getOrCreateRatchetSession,
        saveRatchetSession,
        getGroupSenderKey,
        registerGroupSenderKey,
        createMyGroupSenderKey,
        addAuditLog,
        toggleTorRouting,
      }}
    >
      {children}
    </CryptoContext.Provider>
  );
};

export const useCrypto = () => {
  const context = useContext(CryptoContext);
  if (!context) {
    throw new Error('useCrypto must be used within a CryptoProvider');
  }
  return context;
};
