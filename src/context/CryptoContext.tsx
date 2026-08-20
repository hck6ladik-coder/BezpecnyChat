import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { UserProfile, SecurityAuditEntry } from '../types/chat';
import { deriveKeccakAddress, bytesToHex, hexToBytes, keccak256Hex } from '../crypto/keccak';
import { deriveMasterKey, deriveSubkeys } from '../crypto/kdf';
import { encryptJson, decryptJson, EncryptedPayload } from '../crypto/aes';
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

export interface UserAccountRecord {
  username: string;
  saltHex: string;
  address: string;
  avatar: string;
  authVerifier?: string;
  encryptedProfile?: EncryptedPayload;
  encryptedPrekeys?: EncryptedPayload;
  createdAt: number;
  rememberLogin?: boolean;
}

interface CryptoContextType {
  isInitialized: boolean;
  isUnlocked: boolean;
  profile: UserProfile | null;
  prekeys: StoredPrekeys | null;
  publicBundle: UserPrekeyBundle | null;
  auditLogs: SecurityAuditEntry[];
  savedUsername: string;
  savedAccounts: Array<{ username: string; address: string; avatar: string }>;
  
  checkNicknameAvailable: (username: string) => Promise<{ available: boolean; reason?: string }>;
  createIdentity: (password: string, username: string, rememberLogin?: boolean) => Promise<UserProfile>;
  unlockVault: (password: string, username?: string, rememberLogin?: boolean) => Promise<boolean>;
  lockVault: () => void;
  resetAccount: (username: string) => Promise<void>;
  resetAllLocalData: () => Promise<void>;
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
const STORAGE_KEY_USERNAMES = 'keccak_registered_usernames';
const STORAGE_KEY_LAST_USER = 'keccak_last_username';
const STORAGE_KEY_ACCOUNTS = 'keccak_user_accounts';
const STORAGE_KEY_REMEMBER = 'keccak_remember_login';

const getStoredAccounts = (): Record<string, UserAccountRecord> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACCOUNTS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveStoredAccounts = (accounts: Record<string, UserAccountRecord>) => {
  try {
    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
  } catch {}
};

export const CryptoProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [prekeys, setPrekeys] = useState<StoredPrekeys | null>(null);
  const [publicBundle, setPublicBundle] = useState<UserPrekeyBundle | null>(null);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditEntry[]>([]);
  const [savedUsername, setSavedUsername] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY_LAST_USER) || ''
  );
  
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
    const accounts = getStoredAccounts();
    const hasAccounts = Object.keys(accounts).length > 0;
    const savedSalt = localStorage.getItem(STORAGE_KEY_SALT);
    if (hasAccounts || savedSalt) {
      setIsInitialized(true);
    }
    const lastUser = localStorage.getItem(STORAGE_KEY_LAST_USER);
    if (lastUser) {
      setSavedUsername(lastUser);
    }
  }, []);

  const savedAccounts = Object.values(getStoredAccounts()).map((a) => ({
    username: a.username,
    address: a.address,
    avatar: a.avatar,
  }));

  const checkNicknameAvailable = async (
    rawUsername: string
  ): Promise<{ available: boolean; reason?: string }> => {
    const clean = rawUsername.replace(/^@/, '').trim();
    if (!clean) {
      return { available: false, reason: 'Zadejte prosím přezdívku.' };
    }
    if (clean.length < 2) {
      return { available: false, reason: 'Přezdívka musí mít alespoň 2 znaky.' };
    }
    if (clean.length > 24) {
      return { available: false, reason: 'Přezdívka může mít maximálně 24 znaků.' };
    }

    try {
      const accounts = getStoredAccounts();
      if (accounts[clean.toLowerCase()]) {
        return {
          available: false,
          reason: `Přezdívka "${clean}" je již na tomto zařízení obsazená. Zvolte prosím jinou nebo tento účet resetujte.`,
        };
      }
      const storedJson = localStorage.getItem(STORAGE_KEY_USERNAMES);
      const registeredList: string[] = storedJson ? JSON.parse(storedJson) : [];
      const isTaken = registeredList.some(
        (name) => name.toLowerCase() === clean.toLowerCase()
      );
      if (isTaken) {
        return {
          available: false,
          reason: `Přezdívka "${clean}" je již na tomto zařízení obsazená. Zvolte prosím jinou nebo tento účet resetujte.`,
        };
      }
    } catch {}

    return { available: true };
  };

  const resetAccount = async (rawUsername: string) => {
    const clean = rawUsername.replace(/^@/, '').trim();
    if (!clean) return;
    const userKey = clean.toLowerCase();

    // 1. Remove from stored accounts registry
    const accounts = getStoredAccounts();
    delete accounts[userKey];
    saveStoredAccounts(accounts);

    // 2. Remove from registered list
    try {
      const storedJson = localStorage.getItem(STORAGE_KEY_USERNAMES);
      let registeredList: string[] = storedJson ? JSON.parse(storedJson) : [];
      registeredList = registeredList.filter((n) => n.toLowerCase() !== userKey);
      localStorage.setItem(STORAGE_KEY_USERNAMES, JSON.stringify(registeredList));
    } catch {}

    // 3. Remove from localStorage backups
    localStorage.removeItem('keccak_vault_profile_' + userKey);
    localStorage.removeItem('keccak_vault_prekeys_' + userKey);

    // 4. Remove from IndexedDB
    try {
      await secureStorage.deleteItem(STORAGE_KEY_PROFILE + '_' + userKey);
      await secureStorage.deleteItem(STORAGE_KEY_PREKEYS + '_' + userKey);
    } catch {}

    // 5. Update state
    if (savedUsername.toLowerCase() === userKey || profile?.username.toLowerCase() === userKey) {
      lockVault();
      setSavedUsername('');
      localStorage.removeItem(STORAGE_KEY_LAST_USER);
    }

    if (Object.keys(accounts).length === 0) {
      setIsInitialized(false);
    }

    addAuditLog({
      type: 'blocked_leak',
      title: `Účet @${clean} byl resetován`,
      description: 'Místní kryptografický trezor tohoto účtu byl bezpečně odstraněn.',
      details: { username: clean },
      severity: 'warning',
    });
  };

  const resetAllLocalData = async () => {
    lockVault();
    try {
      await secureStorage.clearAll();
    } catch {}
    localStorage.removeItem(STORAGE_KEY_ACCOUNTS);
    localStorage.removeItem(STORAGE_KEY_USERNAMES);
    localStorage.removeItem(STORAGE_KEY_SALT);
    localStorage.removeItem(STORAGE_KEY_LAST_USER);
    localStorage.removeItem(STORAGE_KEY_REMEMBER);
    setSavedUsername('');
    setIsInitialized(false);

    addAuditLog({
      type: 'blocked_leak',
      title: 'Vymazána veškerá lokální data aplikace',
      description: 'Zařízení bylo vráceno do výchozího stavu.',
      details: {},
      severity: 'warning',
    });
  };

  const createIdentity = async (
    password: string,
    username: string,
    rememberLogin: boolean = true
  ): Promise<UserProfile> => {
    const trimmedNick = username.replace(/^@/, '').trim() || 'Anonymní Uživatel';
    const check = await checkNicknameAvailable(trimmedNick);
    if (!check.available) {
      throw new Error(check.reason || 'Tato přezdívka je již obsazená.');
    }

    const { masterKey, saltHex } = await deriveMasterKey(password, undefined, 20_000);
    const { vaultKey } = deriveSubkeys(masterKey);
    const authVerifier = keccak256Hex(password + ':' + saltHex);

    localStorage.setItem(STORAGE_KEY_SALT, saltHex);
    secureStorage.unlock(masterKey);

    const generatedPrekeys = generateUserPrekeys(30);
    const address = deriveKeccakAddress(generatedPrekeys.identityKeyPair.publicKey);
    const bundle = createPublicPrekeyBundle(generatedPrekeys);

    const newProfile: UserProfile = {
      address,
      username: trimmedNick,
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

    const userKey = trimmedNick.toLowerCase();

    // 1. Encrypt payloads for multi-layer storage
    const encProfile = await encryptJson(newProfile, vaultKey);
    const encPrekeys = await encryptJson(serializedPrekeys, vaultKey);

    // 2. Save into IndexedDB (per-user + default)
    try {
      await secureStorage.saveEncryptedItem(STORAGE_KEY_PROFILE + '_' + userKey, newProfile);
      await secureStorage.saveEncryptedItem(STORAGE_KEY_PREKEYS + '_' + userKey, serializedPrekeys);
      await secureStorage.saveEncryptedItem(STORAGE_KEY_PROFILE, newProfile);
      await secureStorage.saveEncryptedItem(STORAGE_KEY_PREKEYS, serializedPrekeys);
    } catch (idbErr) {
      console.warn('IndexedDB write warning:', idbErr);
    }

    // 3. Save into localStorage backup
    try {
      localStorage.setItem('keccak_vault_profile_' + userKey, JSON.stringify(encProfile));
      localStorage.setItem('keccak_vault_prekeys_' + userKey, JSON.stringify(encPrekeys));
    } catch {}

    // 4. Save account record to multi-user registry
    const accounts = getStoredAccounts();
    accounts[userKey] = {
      username: trimmedNick,
      saltHex,
      address,
      avatar: newProfile.avatar,
      authVerifier,
      encryptedProfile: encProfile,
      encryptedPrekeys: encPrekeys,
      createdAt: Date.now(),
      rememberLogin,
    };
    saveStoredAccounts(accounts);

    // 5. Save to registered usernames list
    try {
      const storedJson = localStorage.getItem(STORAGE_KEY_USERNAMES);
      const registeredList: string[] = storedJson ? JSON.parse(storedJson) : [];
      if (!registeredList.some((n) => n.toLowerCase() === userKey)) {
        registeredList.push(trimmedNick);
        localStorage.setItem(STORAGE_KEY_USERNAMES, JSON.stringify(registeredList));
      }
    } catch {}

    localStorage.setItem(STORAGE_KEY_LAST_USER, trimmedNick);
    localStorage.setItem(STORAGE_KEY_REMEMBER, rememberLogin ? 'true' : 'false');

    setSavedUsername(trimmedNick);
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

  const unlockVault = async (
    password: string,
    username?: string,
    rememberLogin: boolean = true
  ): Promise<boolean> => {
    try {
      const accounts = getStoredAccounts();
      const rawUser = (username || savedUsername || localStorage.getItem(STORAGE_KEY_LAST_USER) || '').trim();
      const cleanUser = rawUser.replace(/^@/, '').trim();
      const userKey = cleanUser.toLowerCase();

      let saltHex: string | null = null;
      let accountRecord: UserAccountRecord | null = null;

      // 1. Find user account in registry
      if (userKey && accounts[userKey]) {
        accountRecord = accounts[userKey];
        saltHex = accountRecord.saltHex;
      } else if (userKey) {
        // Case-insensitive fallback
        const found = Object.values(accounts).find(
          (a) => a.username.toLowerCase() === userKey
        );
        if (found) {
          accountRecord = found;
          saltHex = found.saltHex;
        }
      }

      // If no direct account record, try single account or global salt
      if (!saltHex) {
        const accountKeys = Object.keys(accounts);
        if (accountKeys.length === 1) {
          accountRecord = accounts[accountKeys[0]];
          saltHex = accountRecord.saltHex;
        } else {
          saltHex = localStorage.getItem(STORAGE_KEY_SALT);
        }
      }

      if (!saltHex) {
        console.warn('UnlockVault: No salt found for user', cleanUser);
        return false;
      }

      // Decryption helper across all storage layers
      const tryDecryptAll = async (
        vKey: Uint8Array
      ): Promise<{
        profile: UserProfile;
        prekeysRaw: {
          identityKeyPair: StoredPrekeys['identityKeyPair'];
          signingKeyPair: StoredPrekeys['signingKeyPair'];
          signedPrekeyPair: StoredPrekeys['signedPrekeyPair'];
          oneTimePrekeyPairs: [string, StoredPrekeys['identityKeyPair']][];
        };
      } | null> => {
        let prof: UserProfile | null = null;
        let pre: any = null;

        // Profile: Layer 1 (IDB per-user)
        if (userKey) {
          try {
            prof = await secureStorage.getEncryptedItem<UserProfile>(STORAGE_KEY_PROFILE + '_' + userKey);
          } catch {}
        }
        // Profile: Layer 2 (IDB default)
        if (!prof) {
          try {
            prof = await secureStorage.getEncryptedItem<UserProfile>(STORAGE_KEY_PROFILE);
          } catch {}
        }
        // Profile: Layer 3 (localStorage accountRecord)
        if (!prof && accountRecord?.encryptedProfile) {
          try {
            prof = await decryptJson<UserProfile>(accountRecord.encryptedProfile, vKey);
          } catch {}
        }
        // Profile: Layer 4 (localStorage key)
        if (!prof && userKey) {
          try {
            const raw = localStorage.getItem('keccak_vault_profile_' + userKey);
            if (raw) prof = await decryptJson<UserProfile>(JSON.parse(raw), vKey);
          } catch {}
        }

        // Prekeys: Layer 1 (IDB per-user)
        if (userKey) {
          try {
            pre = await secureStorage.getEncryptedItem(STORAGE_KEY_PREKEYS + '_' + userKey);
          } catch {}
        }
        // Prekeys: Layer 2 (IDB default)
        if (!pre) {
          try {
            pre = await secureStorage.getEncryptedItem(STORAGE_KEY_PREKEYS);
          } catch {}
        }
        // Prekeys: Layer 3 (localStorage accountRecord)
        if (!pre && accountRecord?.encryptedPrekeys) {
          try {
            pre = await decryptJson(accountRecord.encryptedPrekeys, vKey);
          } catch {}
        }
        // Prekeys: Layer 4 (localStorage key)
        if (!pre && userKey) {
          try {
            const raw = localStorage.getItem('keccak_vault_prekeys_' + userKey);
            if (raw) pre = await decryptJson(JSON.parse(raw), vKey);
          } catch {}
        }

        if (prof && pre) {
          return { profile: prof, prekeysRaw: pre };
        }
        return null;
      };

      // Attempt 1: Fast PBKDF2 (20,000 iterations)
      let derivation = await deriveMasterKey(password, saltHex, 20_000);
      let subkeys = deriveSubkeys(derivation.masterKey);
      secureStorage.unlock(derivation.masterKey);
      let decrypted = await tryDecryptAll(subkeys.vaultKey);

      // Attempt 2: Legacy PBKDF2 (210,000 iterations for accounts created in older version)
      if (!decrypted) {
        try {
          derivation = await deriveMasterKey(password, saltHex, 210_000);
          subkeys = deriveSubkeys(derivation.masterKey);
          secureStorage.unlock(derivation.masterKey);
          decrypted = await tryDecryptAll(subkeys.vaultKey);
        } catch {}
      }

      // Attempt 3: Legacy PBKDF2 (100,000 iterations)
      if (!decrypted) {
        try {
          derivation = await deriveMasterKey(password, saltHex, 100_000);
          subkeys = deriveSubkeys(derivation.masterKey);
          secureStorage.unlock(derivation.masterKey);
          decrypted = await tryDecryptAll(subkeys.vaultKey);
        } catch {}
      }

      // If all attempts failed (wrong password or unreadable vault)
      if (!decrypted) {
        secureStorage.lock();
        return false;
      }

      const { profile: loadedProfile, prekeysRaw: loadedPrekeysRaw } = decrypted;

      // Reconstruct cryptographic prekeys bundle
      const reconstructedPrekeys: StoredPrekeys = {
        identityKeyPair: loadedPrekeysRaw.identityKeyPair,
        signingKeyPair: loadedPrekeysRaw.signingKeyPair,
        signedPrekeyPair: loadedPrekeysRaw.signedPrekeyPair,
        oneTimePrekeyPairs: new Map(loadedPrekeysRaw.oneTimePrekeyPairs),
      };

      const bundle = createPublicPrekeyBundle(reconstructedPrekeys);
      const finalUsername = loadedProfile.username || cleanUser || accountRecord?.username || 'Uživatel';
      const finalKey = finalUsername.toLowerCase();

      // Migrate to fresh 20,000 iterations vault key for instant future unlocks
      const freshDerivation = await deriveMasterKey(password, saltHex, 20_000);
      const freshSubkeys = deriveSubkeys(freshDerivation.masterKey);
      secureStorage.unlock(freshDerivation.masterKey);

      const encProfileFresh = await encryptJson(loadedProfile, freshSubkeys.vaultKey);
      const encPrekeysFresh = await encryptJson(loadedPrekeysRaw, freshSubkeys.vaultKey);

      accounts[finalKey] = {
        username: finalUsername,
        saltHex,
        address: loadedProfile.address,
        avatar: loadedProfile.avatar,
        authVerifier: keccak256Hex(password + ':' + saltHex),
        encryptedProfile: encProfileFresh,
        encryptedPrekeys: encPrekeysFresh,
        createdAt: accountRecord?.createdAt || Date.now(),
        rememberLogin,
      };
      saveStoredAccounts(accounts);

      // Keep localStorage in sync
      localStorage.setItem(STORAGE_KEY_SALT, saltHex);
      localStorage.setItem(STORAGE_KEY_LAST_USER, finalUsername);
      localStorage.setItem(STORAGE_KEY_REMEMBER, rememberLogin ? 'true' : 'false');
      localStorage.setItem('keccak_vault_profile_' + finalKey, JSON.stringify(encProfileFresh));
      localStorage.setItem('keccak_vault_prekeys_' + finalKey, JSON.stringify(encPrekeysFresh));

      // Resync IndexedDB
      try {
        await secureStorage.saveEncryptedItem(STORAGE_KEY_PROFILE + '_' + finalKey, loadedProfile);
        await secureStorage.saveEncryptedItem(STORAGE_KEY_PREKEYS + '_' + finalKey, loadedPrekeysRaw);
        await secureStorage.saveEncryptedItem(STORAGE_KEY_PROFILE, loadedProfile);
        await secureStorage.saveEncryptedItem(STORAGE_KEY_PREKEYS, loadedPrekeysRaw);
      } catch {}

      setSavedUsername(finalUsername);
      setProfile(loadedProfile);
      setPrekeys(reconstructedPrekeys);
      setPublicBundle(bundle);
      setIsUnlocked(true);

      addAuditLog({
        type: 'handshake',
        title: 'Trezor úspěšně odemčen',
        description: 'Všechny kryptografické klíče byly načteny a ověřeny z paměti po PBKDF2 derivaci.',
        details: { address: loadedProfile.address, username: finalUsername },
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
    setProfile(null);
    setRatchetSessions(new Map());
    setGroupSenderKeys(new Map());
    setIsUnlocked(false);

    addAuditLog({
      type: 'blocked_leak',
      title: 'Trezor uzamčen / Uživatel odhlášen',
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

    const userKey = profile.username.toLowerCase();
    await secureStorage.saveEncryptedItem(STORAGE_KEY_PREKEYS + '_' + userKey, serializedPrekeys);
    await secureStorage.saveEncryptedItem(STORAGE_KEY_PREKEYS, serializedPrekeys);

    const vaultKey = secureStorage.getVaultKey();
    if (vaultKey) {
      const encPrekeys = await encryptJson(serializedPrekeys, vaultKey);
      const accounts = getStoredAccounts();
      if (accounts[userKey]) {
        accounts[userKey].encryptedPrekeys = encPrekeys;
        saveStoredAccounts(accounts);
      }
      localStorage.setItem('keccak_vault_prekeys_' + userKey, JSON.stringify(encPrekeys));
    }

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
    const userKey = profile.username.toLowerCase();
    await secureStorage.saveEncryptedItem(STORAGE_KEY_PROFILE + '_' + userKey, updated);
    await secureStorage.saveEncryptedItem(STORAGE_KEY_PROFILE, updated);

    const vaultKey = secureStorage.getVaultKey();
    if (vaultKey) {
      const encProf = await encryptJson(updated, vaultKey);
      const accounts = getStoredAccounts();
      if (accounts[userKey]) {
        accounts[userKey].encryptedProfile = encProf;
        saveStoredAccounts(accounts);
      }
      localStorage.setItem('keccak_vault_profile_' + userKey, JSON.stringify(encProf));
    }

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
    const userKey = profile.username.toLowerCase();
    await secureStorage.saveEncryptedItem(STORAGE_KEY_PROFILE + '_' + userKey, updated);
    await secureStorage.saveEncryptedItem(STORAGE_KEY_PROFILE, updated);

    const vaultKey = secureStorage.getVaultKey();
    if (vaultKey) {
      const encProf = await encryptJson(updated, vaultKey);
      const accounts = getStoredAccounts();
      if (accounts[userKey]) {
        accounts[userKey].encryptedProfile = encProf;
        saveStoredAccounts(accounts);
      }
      localStorage.setItem('keccak_vault_profile_' + userKey, JSON.stringify(encProf));
    }

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
        resetAccount,
        resetAllLocalData,
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
        savedUsername,
        savedAccounts,
        checkNicknameAvailable,
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
