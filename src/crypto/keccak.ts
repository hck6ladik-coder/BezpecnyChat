import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

/**
 * KECCAK-256 primitive implementation for maximum security, integrity and privacy.
 */

export function keccak256(data: Uint8Array | string): Uint8Array {
  const input = typeof data === 'string' ? utf8ToBytes(data) : data;
  return keccak_256(input);
}

export function keccak256Hex(data: Uint8Array | string): string {
  const hash = keccak256(data);
  return bytesToHex(hash);
}

/**
 * Compute an integrity tag for a message/payload using KECCAK256
 */
export function computeKeccakTag(messageContent: Uint8Array | string, timestamp?: number): string {
  const contentBytes = typeof messageContent === 'string' ? utf8ToBytes(messageContent) : messageContent;
  if (timestamp !== undefined) {
    const tsBytes = utf8ToBytes(timestamp.toString());
    const combined = new Uint8Array(contentBytes.length + tsBytes.length);
    combined.set(contentBytes, 0);
    combined.set(tsBytes, contentBytes.length);
    return bytesToHex(keccak256(combined));
  }
  return bytesToHex(keccak256(contentBytes));
}

/**
 * Verify message integrity using KECCAK256
 */
export function verifyKeccakIntegrity(
  messageContent: Uint8Array | string,
  expectedTag: string,
  timestamp?: number
): boolean {
  const calculatedTag = computeKeccakTag(messageContent, timestamp);
  return calculatedTag.toLowerCase() === expectedTag.toLowerCase();
}

/**
 * Derives a privacy-preserving user identifier (Keccak Address) from public key
 * Format: k256:0x... (similar to Ethereum address format derived via Keccak-256)
 */
export function deriveKeccakAddress(publicKeyBytes: Uint8Array): string {
  const hash = keccak256(publicKeyBytes);
  // Take last 20 bytes like Ethereum or full 32 bytes for zero-collision ID
  const addressBytes = hash.slice(12, 32);
  return `k256:0x${bytesToHex(addressBytes)}`;
}

/**
 * Format friendly display address
 */
export function formatKeccakAddress(address: string): string {
  if (!address.startsWith('k256:0x')) return address;
  const hexPart = address.replace('k256:0x', '');
  if (hexPart.length <= 12) return address;
  return `k256:0x${hexPart.slice(0, 6)}...${hexPart.slice(-4)}`;
}

/**
 * Blind Mailbox Token generator (used for zero-metadata routing)
 * Generates an ephemeral recipient token: KECCAK256(recipientAddress + epochSalt)
 */
export function generateBlindMailboxToken(recipientAddress: string, epochSalt: string): string {
  const combined = utf8ToBytes(`${recipientAddress}:${epochSalt}`);
  return bytesToHex(keccak256(combined));
}

export { bytesToHex, hexToBytes, utf8ToBytes };
