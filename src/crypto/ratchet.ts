import { x25519 } from '@noble/curves/ed25519';
import { bytesToHex, hexToBytes, computeKeccakTag, verifyKeccakIntegrity } from './keccak';
import { kdfRatchetStep, kdfRootStep } from './kdf';
import { encryptAesGcm, decryptAesGcm } from './aes';
import { KeyPair, generateDhKeyPair } from './x3dh';

/**
 * Double Ratchet Algorithm with Perfect Forward Secrecy (PFS) and Post-Compromise Security (PCS).
 * Uses KECCAK-256 for KDF chains and AES-256-GCM for message payload encryption.
 */

export interface MessageHeader {
  dhPublicKeyHex: string; // Ratchet public key of sender
  pn: number;             // Previous chain length
  n: number;              // Message index in current chain
}

export interface RatchetEncryptedMessage {
  header: MessageHeader;
  ciphertextHex: string;
  ivHex: string;
  integrityTagHex: string; // KECCAK-256 integrity tag
  timestamp: number;
}

export interface RatchetState {
  dhs: KeyPair;                     // Our current DH ratchet key pair
  dhr: Uint8Array | null;           // Remote party's current DH ratchet public key
  dhrHex: string | null;
  rk: Uint8Array;                   // 32-byte Root Key
  cks: Uint8Array | null;           // Sending chain key
  ckr: Uint8Array | null;           // Receiving chain key
  ns: number;                       // Number of sent messages in current chain
  nr: number;                       // Number of received messages in current chain
  pn: number;                       // Previous sending chain length
  mkSkipped: Map<string, Uint8Array>; // Skipped message keys: "dhHex:msgNum" => messageKey
}

const MAX_SKIPPED_KEYS = 1000;

/**
 * Initialize Alice (Initiator) Ratchet State
 */
export function initRatchetAsAlice(
  sharedMasterKey: Uint8Array,
  bobDhPublicKey: Uint8Array
): RatchetState {
  const aliceDh = generateDhKeyPair();
  const dhShared = x25519.getSharedSecret(aliceDh.privateKey, bobDhPublicKey);
  const { nextRootKey, newChainKey } = kdfRootStep(sharedMasterKey, dhShared);

  return {
    dhs: aliceDh,
    dhr: bobDhPublicKey,
    dhrHex: bytesToHex(bobDhPublicKey),
    rk: nextRootKey,
    cks: newChainKey,
    ckr: null,
    ns: 0,
    nr: 0,
    pn: 0,
    mkSkipped: new Map(),
  };
}

/**
 * Initialize Bob (Receiver) Ratchet State
 */
export function initRatchetAsBob(
  sharedMasterKey: Uint8Array,
  bobDhKeyPair: KeyPair
): RatchetState {
  return {
    dhs: bobDhKeyPair,
    dhr: null,
    dhrHex: null,
    rk: sharedMasterKey,
    cks: null,
    ckr: null,
    ns: 0,
    nr: 0,
    pn: 0,
    mkSkipped: new Map(),
  };
}

/**
 * Encrypt a message using Double Ratchet
 */
export async function ratchetEncrypt(
  state: RatchetState,
  plaintext: string | Uint8Array
): Promise<{ newState: RatchetState; message: RatchetEncryptedMessage }> {
  if (!state.cks) {
    throw new Error('Sending chain key not initialized in Ratchet state');
  }

  // 1. Advance symmetric sending ratchet
  const { nextChainKey, messageKey } = kdfRatchetStep(state.cks);

  // 2. Compute KECCAK256 integrity tag for plaintext
  const timestamp = Date.now();
  const integrityTagHex = computeKeccakTag(plaintext, timestamp);

  // 3. Encrypt payload with AES-256-GCM using derived message key
  const header: MessageHeader = {
    dhPublicKeyHex: state.dhs.publicKeyHex,
    pn: state.pn,
    n: state.ns,
  };

  const associatedData = new TextEncoder().encode(JSON.stringify(header));
  const { ciphertextWithTag, iv } = await encryptAesGcm(plaintext, messageKey, associatedData);

  // 4. Update ratchet state
  const newState: RatchetState = {
    ...state,
    cks: nextChainKey,
    ns: state.ns + 1,
  };

  const message: RatchetEncryptedMessage = {
    header,
    ciphertextHex: bytesToHex(ciphertextWithTag),
    ivHex: bytesToHex(iv),
    integrityTagHex,
    timestamp,
  };

  return { newState, message };
}

/**
 * Decrypt a message using Double Ratchet
 */
export async function ratchetDecrypt(
  state: RatchetState,
  message: RatchetEncryptedMessage
): Promise<{ newState: RatchetState; plaintext: string }> {
  let currentState = { ...state, mkSkipped: new Map(state.mkSkipped) };
  const remoteDh = hexToBytes(message.header.dhPublicKeyHex);

  // 1. Check if message key was previously skipped (out-of-order delivery)
  const skippedKeyId = `${message.header.dhPublicKeyHex}:${message.header.n}`;
  let messageKey = currentState.mkSkipped.get(skippedKeyId);

  if (messageKey) {
    // Key found in skipped cache -> delete it immediately (PFS)
    currentState.mkSkipped.delete(skippedKeyId);
  } else {
    // 2. Perform DH Ratchet step if remote DH key changed
    if (!currentState.dhr || currentState.dhrHex !== message.header.dhPublicKeyHex) {
      if (currentState.ckr) {
        currentState = skipMessageKeys(currentState, message.header.pn);
      }
      currentState = dhRatchet(currentState, remoteDh);
    }

    // 3. Skip message keys in current receiving chain up to message.n
    currentState = skipMessageKeys(currentState, message.header.n);

    // 4. Derive message key and advance receiving chain
    if (!currentState.ckr) {
      throw new Error('Receiving chain key is null during decryption');
    }
    const step = kdfRatchetStep(currentState.ckr);
    currentState.ckr = step.nextChainKey;
    currentState.nr = currentState.nr + 1;
    messageKey = step.messageKey;
  }

  // 5. Decrypt ciphertext with AES-256-GCM
  const ciphertextBytes = hexToBytes(message.ciphertextHex);
  const ivBytes = hexToBytes(message.ivHex);
  const associatedData = new TextEncoder().encode(JSON.stringify(message.header));

  const decryptedBytes = await decryptAesGcm(
    ciphertextBytes,
    messageKey,
    ivBytes,
    associatedData
  );

  const plaintext = new TextDecoder().decode(decryptedBytes);

  // 6. Verify KECCAK-256 integrity tag
  const isValidIntegrity = verifyKeccakIntegrity(
    plaintext,
    message.integrityTagHex,
    message.timestamp
  );
  if (!isValidIntegrity) {
    throw new Error('KECCAK-256 Integrity Verification Failed: Message tampered or corrupted');
  }

  return { newState: currentState, plaintext };
}

/**
 * Handle skipped message keys for out-of-order message delivery
 */
function skipMessageKeys(state: RatchetState, until: number): RatchetState {
  if (state.nr + 100 < until) {
    throw new Error('Too many skipped messages, exceeding safety threshold');
  }

  if (state.ckr) {
    let currentCkr = state.ckr;
    let currentNr = state.nr;

    while (currentNr < until) {
      const { nextChainKey, messageKey } = kdfRatchetStep(currentCkr);
      currentCkr = nextChainKey;

      if (state.dhrHex) {
        state.mkSkipped.set(`${state.dhrHex}:${currentNr}`, messageKey);
        if (state.mkSkipped.size > MAX_SKIPPED_KEYS) {
          const firstKey = state.mkSkipped.keys().next().value;
          if (firstKey) state.mkSkipped.delete(firstKey);
        }
      }
      currentNr++;
    }

    return {
      ...state,
      ckr: currentCkr,
      nr: currentNr,
    };
  }

  return state;
}

/**
 * Perform a Diffie-Hellman Ratchet Step (DH Ratchet)
 */
function dhRatchet(state: RatchetState, remoteDh: Uint8Array): RatchetState {
  const pn = state.ns;
  const ns = 0;
  const nr = 0;
  const dhr = remoteDh;
  const dhrHex = bytesToHex(remoteDh);

  // Compute shared secret DH(DHs, DHr)
  const dhOutput = x25519.getSharedSecret(state.dhs.privateKey, dhr);
  const rootStep1 = kdfRootStep(state.rk, dhOutput);
  const ckr = rootStep1.newChainKey;

  // Generate new ephemeral DH key pair for next send
  const newDhs = generateDhKeyPair();
  const dhOutput2 = x25519.getSharedSecret(newDhs.privateKey, dhr);
  const rootStep2 = kdfRootStep(rootStep1.nextRootKey, dhOutput2);
  const cks = rootStep2.newChainKey;

  return {
    ...state,
    dhs: newDhs,
    dhr,
    dhrHex,
    rk: rootStep2.nextRootKey,
    cks,
    ckr,
    ns,
    nr,
    pn,
  };
}
