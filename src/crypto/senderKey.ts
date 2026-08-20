import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex, hexToBytes, keccak256, computeKeccakTag, verifyKeccakIntegrity } from './keccak';
import { hkdfKeccak } from './kdf';
import { encryptAesGcm, decryptAesGcm } from './aes';

/**
 * Signal Sender Key Protocol for End-to-End Encrypted Group Chats.
 * Scales securely to groups of up to 2000 users.
 */

export interface SenderKeyState {
  groupId: string;
  senderAddress: string;
  chainKey: Uint8Array;
  iteration: number;
  signingPublicKeyHex: string;
  signingPrivateKeyHex?: string; // Only present for our own sender key
  messageKeysCache: Map<number, Uint8Array>; // For out-of-order group messages
}

export interface SenderKeyDistributionMessage {
  groupId: string;
  senderAddress: string;
  chainKeyHex: string;
  iteration: number;
  signingPublicKeyHex: string;
}

export interface GroupEncryptedMessage {
  groupId: string;
  senderAddress: string;
  iteration: number;
  ciphertextHex: string;
  ivHex: string;
  integrityTagHex: string;
  signatureHex: string;
  timestamp: number;
}

/**
 * Generate a new Sender Key state for our own participant in a group
 */
export function createGroupSenderKey(groupId: string, senderAddress: string): {
  state: SenderKeyState;
  distributionMessage: SenderKeyDistributionMessage;
} {
  const chainKey = crypto.getRandomValues(new Uint8Array(32));
  const signingPrivateKey = ed25519.utils.randomPrivateKey();
  const signingPublicKey = ed25519.getPublicKey(signingPrivateKey);

  const state: SenderKeyState = {
    groupId,
    senderAddress,
    chainKey,
    iteration: 0,
    signingPublicKeyHex: bytesToHex(signingPublicKey),
    signingPrivateKeyHex: bytesToHex(signingPrivateKey),
    messageKeysCache: new Map(),
  };

  const distributionMessage: SenderKeyDistributionMessage = {
    groupId,
    senderAddress,
    chainKeyHex: bytesToHex(chainKey),
    iteration: 0,
    signingPublicKeyHex: bytesToHex(signingPublicKey),
  };

  return { state, distributionMessage };
}

/**
 * Process an incoming Sender Key Distribution Message from another group member
 */
export function processSenderKeyDistribution(
  dist: SenderKeyDistributionMessage
): SenderKeyState {
  return {
    groupId: dist.groupId,
    senderAddress: dist.senderAddress,
    chainKey: hexToBytes(dist.chainKeyHex),
    iteration: dist.iteration,
    signingPublicKeyHex: dist.signingPublicKeyHex,
    messageKeysCache: new Map(),
  };
}

/**
 * Ratchet sender chain key step using KECCAK-256
 */
function senderKeyRatchetStep(chainKey: Uint8Array): {
  nextChainKey: Uint8Array;
  messageKey: Uint8Array;
} {
  const expanded = hkdfKeccak(chainKey, new Uint8Array(32), 'sender-key-step', 64);
  return {
    messageKey: expanded.slice(0, 32),
    nextChainKey: expanded.slice(32, 64),
  };
}

/**
 * Encrypt group message with our Sender Key
 */
export async function groupEncrypt(
  state: SenderKeyState,
  plaintext: string | Uint8Array
): Promise<{ newState: SenderKeyState; message: GroupEncryptedMessage }> {
  if (!state.signingPrivateKeyHex) {
    throw new Error('Cannot encrypt group message without private signing key');
  }

  // 1. Ratchet sender chain
  const { nextChainKey, messageKey } = senderKeyRatchetStep(state.chainKey);
  const currentIteration = state.iteration;
  const timestamp = Date.now();

  // 2. Compute KECCAK256 integrity tag
  const integrityTagHex = computeKeccakTag(plaintext, timestamp);

  // 3. Encrypt payload with AES-256-GCM
  const ad = new TextEncoder().encode(`${state.groupId}:${state.senderAddress}:${currentIteration}`);
  const { ciphertextWithTag, iv } = await encryptAesGcm(plaintext, messageKey, ad);

  // 4. Sign the ciphertext + tag + metadata with Ed25519
  const sigPayload = new TextEncoder().encode(
    `${state.groupId}:${state.senderAddress}:${currentIteration}:${integrityTagHex}:${bytesToHex(ciphertextWithTag)}`
  );
  const sigHash = keccak256(sigPayload);
  const sigBytes = ed25519.sign(sigHash, hexToBytes(state.signingPrivateKeyHex));

  const newState: SenderKeyState = {
    ...state,
    chainKey: nextChainKey,
    iteration: currentIteration + 1,
  };

  const message: GroupEncryptedMessage = {
    groupId: state.groupId,
    senderAddress: state.senderAddress,
    iteration: currentIteration,
    ciphertextHex: bytesToHex(ciphertextWithTag),
    ivHex: bytesToHex(iv),
    integrityTagHex,
    signatureHex: bytesToHex(sigBytes),
    timestamp,
  };

  return { newState, message };
}

/**
 * Decrypt group message sent by a participant
 */
export async function groupDecrypt(
  state: SenderKeyState,
  message: GroupEncryptedMessage
): Promise<{ newState: SenderKeyState; plaintext: string }> {
  let currentState = { ...state, messageKeysCache: new Map(state.messageKeysCache) };

  // 1. Verify Sender Signature
  const sigPayload = new TextEncoder().encode(
    `${message.groupId}:${message.senderAddress}:${message.iteration}:${message.integrityTagHex}:${message.ciphertextHex}`
  );
  const sigHash = keccak256(sigPayload);
  const isValidSig = ed25519.verify(
    hexToBytes(message.signatureHex),
    sigHash,
    hexToBytes(currentState.signingPublicKeyHex)
  );

  if (!isValidSig) {
    throw new Error('Group Message Signature Verification Failed!');
  }

  // 2. Retrieve or ratchet to message key
  let messageKey = currentState.messageKeysCache.get(message.iteration);

  if (messageKey) {
    currentState.messageKeysCache.delete(message.iteration); // PFS
  } else {
    if (message.iteration < currentState.iteration) {
      throw new Error('Received duplicate or expired group message key');
    }
    if (message.iteration - currentState.iteration > 500) {
      throw new Error('Group message iteration gap exceeded security threshold');
    }

    // Fast-forward chain key while caching skipped keys
    let currentChainKey = currentState.chainKey;
    let currIt = currentState.iteration;

    while (currIt < message.iteration) {
      const step = senderKeyRatchetStep(currentChainKey);
      currentChainKey = step.nextChainKey;
      currentState.messageKeysCache.set(currIt, step.messageKey);
      currIt++;
    }

    const currentStep = senderKeyRatchetStep(currentChainKey);
    currentState.chainKey = currentStep.nextChainKey;
    currentState.iteration = currIt + 1;
    messageKey = currentStep.messageKey;
  }

  // 3. Decrypt AES-256-GCM payload
  const ad = new TextEncoder().encode(`${message.groupId}:${message.senderAddress}:${message.iteration}`);
  const decryptedBytes = await decryptAesGcm(
    hexToBytes(message.ciphertextHex),
    messageKey,
    hexToBytes(message.ivHex),
    ad
  );

  const plaintext = new TextDecoder().decode(decryptedBytes);

  // 4. Verify KECCAK-256 integrity tag
  const isValidIntegrity = verifyKeccakIntegrity(
    plaintext,
    message.integrityTagHex,
    message.timestamp
  );
  if (!isValidIntegrity) {
    throw new Error('Group message KECCAK-256 integrity check failed!');
  }

  return { newState: currentState, plaintext };
}
