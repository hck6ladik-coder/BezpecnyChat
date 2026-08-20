import { keccak256, hexToBytes, utf8ToBytes } from './keccak';

/**
 * Safety Numbers computation based on KECCAK-256.
 * Generates identical 60-digit fingerprints and QR payloads regardless of which user initiates.
 */

const SAFETY_NUMBER_ROUNDS = 5200;

export interface SafetyNumberData {
  fingerprint: string;          // 60-digit string
  formattedBlocks: string[];    // Array of 12 x 5-digit blocks
  qrPayload: string;            // Standard QR payload
  shortVerificationCode: string;// 6-character visual SAS
}

/**
 * Compute symmetric Safety Number between two users from their Identity Keys
 */
export function computeSafetyNumber(
  ourIdentityKeyHex: string,
  theirIdentityKeyHex: string,
  ourAddress: string,
  theirAddress: string
): SafetyNumberData {
  const keys = [ourIdentityKeyHex.toLowerCase(), theirIdentityKeyHex.toLowerCase()].sort();
  const addresses = [ourAddress.toLowerCase(), theirAddress.toLowerCase()].sort();

  const combined = `${keys[0]}:${keys[1]}:${addresses[0]}:${addresses[1]}`;
  let hashBuffer = keccak256(utf8ToBytes(combined));

  // Perform 5200 iterative KECCAK-256 hashing rounds to resist rainbow table attacks
  for (let i = 0; i < SAFETY_NUMBER_ROUNDS; i++) {
    const roundData = new Uint8Array(hashBuffer.length + 4);
    roundData.set(hashBuffer, 0);
    roundData[hashBuffer.length] = (i >> 24) & 0xff;
    roundData[hashBuffer.length + 1] = (i >> 16) & 0xff;
    roundData[hashBuffer.length + 2] = (i >> 8) & 0xff;
    roundData[hashBuffer.length + 3] = i & 0xff;
    hashBuffer = keccak256(roundData);
  }

  const blocks: string[] = [];
  for (let i = 0; i < 12; i++) {
    const offset = (i * 2) % (hashBuffer.length - 2);
    const num = ((hashBuffer[offset] << 8) | hashBuffer[offset + 1]) % 100000;
    blocks.push(num.toString().padStart(5, '0'));
  }

  const fingerprint = blocks.join('');
  const shortVerificationCode = `${blocks[0].slice(0, 3)}-${blocks[1].slice(0, 3)}`;
  const qrPayload = `k256:v1:safety:${keys[0].slice(0, 16)}:${keys[1].slice(0, 16)}:${fingerprint}`;

  return {
    fingerprint,
    formattedBlocks: blocks,
    qrPayload,
    shortVerificationCode,
  };
}

/**
 * Verify scanned QR code against local computation
 */
export function verifyScannedSafetyQr(
  scannedPayload: string,
  expectedSafetyData: SafetyNumberData
): boolean {
  if (!scannedPayload.startsWith('k256:v1:safety:')) {
    return false;
  }
  return scannedPayload.includes(expectedSafetyData.fingerprint);
}
