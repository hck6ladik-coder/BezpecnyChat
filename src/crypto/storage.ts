import { encryptJson, decryptJson, EncryptedPayload } from './aes';
import { deriveSubkeys } from './kdf';

/**
 * Secure Encrypted Local Vault using AES-256-GCM and IndexedDB.
 * Ensures zero plaintext keys or messages reside in non-volatile storage.
 */

const DB_NAME = 'KeccakSecureVault';
const DB_VERSION = 1;
const STORE_NAME = 'encrypted_records';

export interface VaultMetadata {
  isInitialized: boolean;
  saltHex: string;
  has2FA: boolean;
  userAddress: string;
}

export interface EncryptedVaultContainer {
  key: string;
  payload: EncryptedPayload;
  updatedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class SecureStorage {
  private vaultKey: Uint8Array | null = null;

  public unlock(masterKey: Uint8Array) {
    const { vaultKey } = deriveSubkeys(masterKey);
    this.vaultKey = vaultKey;
  }

  public lock() {
    this.vaultKey = null;
  }

  public isUnlocked(): boolean {
    return this.vaultKey !== null;
  }

  public async saveEncryptedItem<T>(key: string, data: T): Promise<void> {
    if (!this.vaultKey) {
      throw new Error('Vault is locked. Cannot save encrypted data.');
    }

    const payload = await encryptJson(data, this.vaultKey);
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: EncryptedVaultContainer = {
        key,
        payload,
        updatedAt: Date.now(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getEncryptedItem<T>(key: string): Promise<T | null> {
    if (!this.vaultKey) {
      throw new Error('Vault is locked. Cannot read encrypted data.');
    }

    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = async () => {
        const record = req.result as EncryptedVaultContainer | undefined;
        if (!record || !record.payload) {
          resolve(null);
          return;
        }
        try {
          const decrypted = await decryptJson<T>(record.payload, this.vaultKey!);
          resolve(decrypted);
        } catch (err) {
          reject(err);
        }
      };

      req.onerror = () => reject(req.error);
    });
  }

  public async deleteItem(key: string): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async clearAll(): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

export const secureStorage = new SecureStorage();
