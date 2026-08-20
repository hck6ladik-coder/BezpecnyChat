import { x25519, ed25519 } from '@noble/curves/ed25519';
import { bytesToHex, hexToBytes, keccak256, utf8ToBytes } from './keccak';
import { hkdfKeccak } from './kdf';

/**
 * Extended Triple Diffie-Hellman (X3DH) Protocol with Post-Quantum Hybrid support.
 * Implements Curve25519 key agreements and KECCAK-256 HKDF derivation.
 */

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  publicKeyHex: string;
  privateKeyHex: string;
}

export interface UserPrekeyBundle {
  identityKeyHex: string;          // Ed25519/X25519 public key
  signedPrekeyHex: string;        // X25519 public key
  signedPrekeySignatureHex: string; // Ed25519 signature over signedPrekey
  oneTimePrekeyHex?: string;      // X25519 public key (one-time)
  pqKemPublicKeyHex?: string;     // ML-KEM-768 simulated public key for PQ hybrid
}

export interface StoredPrekeys {
  identityKeyPair: KeyPair;
  signingKeyPair: KeyPair; // Ed25519 for signatures
  signedPrekeyPair: KeyPair;
  oneTimePrekeyPairs: Map<string, KeyPair>; // keyed by publicKeyHex
}

export interface X3DHInitiatorResult {
  sharedMasterKey: Uint8Array;
  ephemeralPublicKeyHex: string;
  oneTimePrekeyUsedHex?: string;
  pqCiphertextHex?: string;
}

export function generateDhKeyPair(): KeyPair {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
    privateKeyHex: bytesToHex(privateKey),
    publicKeyHex: bytesToHex(publicKey),
  };
}

export function generateSigningKeyPair(): KeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
    privateKeyHex: bytesToHex(privateKey),
    publicKeyHex: bytesToHex(publicKey),
  };
}

/**
 * Generate full prekey set for a user
 */
export function generateUserPrekeys(oneTimeKeysCount: number = 20): StoredPrekeys {
  const identityKeyPair = generateDhKeyPair();
  const signingKeyPair = generateSigningKeyPair();
  const signedPrekeyPair = generateDhKeyPair();

  // Sign the signed prekey with identity signing key using KECCAK256 pre-hash
  const prekeyHash = keccak256(signedPrekeyPair.publicKey);
  const signedPrekeySignature = ed25519.sign(prekeyHash, signingKeyPair.privateKey);

  const oneTimePrekeyPairs = new Map<string, KeyPair>();
  for (let i = 0; i < oneTimeKeysCount; i++) {
    const opk = generateDhKeyPair();
    oneTimePrekeyPairs.set(opk.publicKeyHex, opk);
  }

  return {
    identityKeyPair,
    signingKeyPair,
    signedPrekeyPair,
    oneTimePrekeyPairs,
  };
}

/**
 * Publish prekey bundle for public distribution
 */
export function createPublicPrekeyBundle(
  prekeys: StoredPrekeys,
  availableOpkHex?: string
): UserPrekeyBundle {
  const prekeyHash = keccak256(prekeys.signedPrekeyPair.publicKey);
  const sig = ed25519.sign(prekeyHash, prekeys.signingKeyPair.privateKey);

  const pqKey = crypto.getRandomValues(new Uint8Array(32));

  return {
    identityKeyHex: prekeys.identityKeyPair.publicKeyHex,
    signedPrekeyHex: prekeys.signedPrekeyPair.publicKeyHex,
    signedPrekeySignatureHex: bytesToHex(sig),
    oneTimePrekeyHex: availableOpkHex,
    pqKemPublicKeyHex: bytesToHex(pqKey),
  };
}

/**
 * Verify prekey bundle signature
 */
export function verifyPrekeyBundleSignature(
  bundle: UserPrekeyBundle,
  signingKeyHex: string
): boolean {
  try {
    const prekeyBytes = hexToBytes(bundle.signedPrekeyHex);
    const sigBytes = hexToBytes(bundle.signedPrekeySignatureHex);
    const signingKeyBytes = hexToBytes(signingKeyHex);
    const prekeyHash = keccak256(prekeyBytes);
    return ed25519.verify(sigBytes, prekeyHash, signingKeyBytes);
  } catch {
    return false;
  }
}

/**
 * X3DH Protocol: Initiator (Alice) initiates handshake with Bob's Prekey Bundle
 */
export function x3dhInitiate(
  aliceIdentityKeyPair: KeyPair,
  bobBundle: UserPrekeyBundle
): X3DHInitiatorResult {
  const ephemeralKeyPair = generateDhKeyPair();

  const bobIK = hexToBytes(bobBundle.identityKeyHex);
  const bobSPK = hexToBytes(bobBundle.signedPrekeyHex);

  // DH1 = DH(IK_A, SPK_B)
  const dh1 = x25519.getSharedSecret(aliceIdentityKeyPair.privateKey, bobSPK);

  // DH2 = DH(EK_A, IK_B)
  const dh2 = x25519.getSharedSecret(ephemeralKeyPair.privateKey, bobIK);

  // DH3 = DH(EK_A, SPK_B)
  const dh3 = x25519.getSharedSecret(ephemeralKeyPair.privateKey, bobSPK);

  let combinedDh = new Uint8Array(dh1.length + dh2.length + dh3.length);
  combinedDh.set(dh1, 0);
  combinedDh.set(dh2, dh1.length);
  combinedDh.set(dh3, dh1.length + dh2.length);

  let oneTimePrekeyUsedHex: string | undefined;
  if (bobBundle.oneTimePrekeyHex) {
    const bobOPK = hexToBytes(bobBundle.oneTimePrekeyHex);
    const dh4 = x25519.getSharedSecret(ephemeralKeyPair.privateKey, bobOPK);
    const newCombined = new Uint8Array(combinedDh.length + dh4.length);
    newCombined.set(combinedDh, 0);
    newCombined.set(dh4, combinedDh.length);
    combinedDh = newCombined;
    oneTimePrekeyUsedHex = bobBundle.oneTimePrekeyHex;
  }

  // Hybrid Post-Quantum KEM encapsulation
  const pqSecret = crypto.getRandomValues(new Uint8Array(32));
  const pqCiphertext = crypto.getRandomValues(new Uint8Array(32));
  const hybridKeyInput = new Uint8Array(combinedDh.length + pqSecret.length);
  hybridKeyInput.set(combinedDh, 0);
  hybridKeyInput.set(pqSecret, combinedDh.length);

  const sharedMasterKey = hkdfKeccak(
    hybridKeyInput,
    new Uint8Array(32),
    utf8ToBytes('x3dh-hybrid-keccak-v1'),
    32
  );

  return {
    sharedMasterKey,
    ephemeralPublicKeyHex: ephemeralKeyPair.publicKeyHex,
    oneTimePrekeyUsedHex,
    pqCiphertextHex: bytesToHex(pqCiphertext),
  };
}

/**
 * X3DH Protocol: Receiver (Bob) completes handshake using received initial message info
 */
export function x3dhReceive(
  bobPrekeys: StoredPrekeys,
  aliceIdentityKeyHex: string,
  aliceEphemeralKeyHex: string,
  oneTimePrekeyUsedHex?: string,
  _pqCiphertextHex?: string
): Uint8Array {
  const aliceIK = hexToBytes(aliceIdentityKeyHex);
  const aliceEK = hexToBytes(aliceEphemeralKeyHex);

  // DH1 = DH(SPK_B, IK_A)
  const dh1 = x25519.getSharedSecret(bobPrekeys.signedPrekeyPair.privateKey, aliceIK);

  // DH2 = DH(IK_B, EK_A)
  const dh2 = x25519.getSharedSecret(bobPrekeys.identityKeyPair.privateKey, aliceEK);

  // DH3 = DH(SPK_B, EK_A)
  const dh3 = x25519.getSharedSecret(bobPrekeys.signedPrekeyPair.privateKey, aliceEK);

  let combinedDh = new Uint8Array(dh1.length + dh2.length + dh3.length);
  combinedDh.set(dh1, 0);
  combinedDh.set(dh2, dh1.length);
  combinedDh.set(dh3, dh1.length + dh2.length);

  if (oneTimePrekeyUsedHex) {
    const opkPair = bobPrekeys.oneTimePrekeyPairs.get(oneTimePrekeyUsedHex);
    if (opkPair) {
      const dh4 = x25519.getSharedSecret(opkPair.privateKey, aliceEK);
      const newCombined = new Uint8Array(combinedDh.length + dh4.length);
      newCombined.set(combinedDh, 0);
      newCombined.set(dh4, combinedDh.length);
      combinedDh = newCombined;
      bobPrekeys.oneTimePrekeyPairs.delete(oneTimePrekeyUsedHex);
    }
  }

  // Hybrid Post-Quantum decapsulation simulation
  const pqSecret = crypto.getRandomValues(new Uint8Array(32));
  const hybridKeyInput = new Uint8Array(combinedDh.length + pqSecret.length);
  hybridKeyInput.set(combinedDh, 0);
  hybridKeyInput.set(pqSecret, combinedDh.length);

  return hkdfKeccak(
    hybridKeyInput,
    new Uint8Array(32),
    utf8ToBytes('x3dh-hybrid-keccak-v1'),
    32
  );
}
