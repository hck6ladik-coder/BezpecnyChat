import { keccak_256 } from '@noble/hashes/sha3';
import { hkdf } from '@noble/hashes/hkdf';
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { utf8ToBytes, bytesToHex, hexToBytes } from '@noble/hashes/utils';

/**
 * Key Derivation Functions (KDF) leveraging KECCAK-256 as the core primitive.
 */

export const PBKDF2_ITERATIONS = 10_000;

/**
 * HKDF using KECCAK-256 for Double Ratchet and X3DH key derivation
 */
export function hkdfKeccak(
  ikm: Uint8Array,
  salt: Uint8Array = new Uint8Array(32),
  info: string | Uint8Array = 'keccak-e2ee-kdf',
  length: number = 64
): Uint8Array {
  const infoBytes = typeof info === 'string' ? utf8ToBytes(info) : info;
  return hkdf(keccak_256, ikm, salt, infoBytes, length);
}

/**
 * Derives a 32-byte Master Encryption Key from a user password and unique salt using PBKDF2-KECCAK256
 * with resistance against brute-force and dictionary attacks.
 */
export async function deriveMasterKey(
  passphrase: string,
  saltHex?: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<{ masterKey: Uint8Array; masterKeyHex: string; saltHex: string }> {
  let salt: Uint8Array;
  if (saltHex) {
    salt = hexToBytes(saltHex);
  } else {
    salt = crypto.getRandomValues(new Uint8Array(32));
  }

  const passwordBytes = utf8ToBytes(passphrase);
  const derivedBytes = await pbkdf2Async(keccak_256, passwordBytes, salt, {
    c: iterations,
    dkLen: 32,
  });

  return {
    masterKey: derivedBytes,
    masterKeyHex: bytesToHex(derivedBytes),
    saltHex: bytesToHex(salt),
  };
}

/**
 * Derive domain-specific subkeys from Master Key (Vault key, Auth token key, Backup key)
 */
export function deriveSubkeys(masterKey: Uint8Array): {
  vaultKey: Uint8Array;
  authKey: Uint8Array;
  backupKey: Uint8Array;
} {
  const vaultKey = hkdfKeccak(masterKey, new Uint8Array(32), 'vault-encryption', 32);
  const authKey = hkdfKeccak(masterKey, new Uint8Array(32), 'auth-token-derivation', 32);
  const backupKey = hkdfKeccak(masterKey, new Uint8Array(32), 'backup-export', 32);

  return { vaultKey, authKey, backupKey };
}

/**
 * Ratchet KDF Step for Symmetric Ratchet
 * Input: ChainKey (32 bytes)
 * Output: { nextChainKey: 32 bytes, messageKey: 32 bytes }
 */
export function kdfRatchetStep(chainKey: Uint8Array): {
  nextChainKey: Uint8Array;
  messageKey: Uint8Array;
} {
  const expanded = hkdf(keccak_256, chainKey, new Uint8Array(32), utf8ToBytes('ratchet-step'), 64);
  const messageKey = expanded.slice(0, 32);
  const nextChainKey = expanded.slice(32, 64);
  return { nextChainKey, messageKey };
}

/**
 * KDF Root Step for DH Ratchet
 * Input: RootKey (32 bytes), DH_Output (32 bytes)
 * Output: { nextRootKey: 32 bytes, newChainKey: 32 bytes }
 */
export function kdfRootStep(
  rootKey: Uint8Array,
  dhOutput: Uint8Array
): { nextRootKey: Uint8Array; newChainKey: Uint8Array } {
  const expanded = hkdf(keccak_256, dhOutput, rootKey, utf8ToBytes('root-ratchet-step'), 64);
  const nextRootKey = expanded.slice(0, 32);
  const newChainKey = expanded.slice(32, 64);
  return { nextRootKey, newChainKey };
}
