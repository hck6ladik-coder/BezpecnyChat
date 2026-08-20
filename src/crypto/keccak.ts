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
/**
 * Format friendly display address as a short memorable tag (e.g. #8D7-2AB)
 */
export function formatKeccakAddress(address?: string): string {
  if (!address) return '';
  const clean = address.replace('k256:0x', '').replace('0x', '').toLowerCase();
  if (clean.length < 6) return address;
  const p1 = clean.slice(0, 3).toUpperCase();
  const p2 = clean.slice(3, 6).toUpperCase();
  return `#${p1}-${p2}`;
}

/**
 * Checks if two peer addresses or short tags represent the exact same entity
 */
export function isSamePeer(addr1?: string, addr2?: string): boolean {
  if (!addr1 || !addr2) return false;
  const c1 = addr1.replace('k256:0x', '').replace('#', '').replace('-', '').trim().toLowerCase();
  const c2 = addr2.replace('k256:0x', '').replace('#', '').replace('-', '').trim().toLowerCase();
  if (c1 === c2) return true;
  if (c1.length >= 6 && c2.length >= 6) {
    return c1.slice(0, 6) === c2.slice(0, 6);
  }
  return false;
}

/**
 * Format friendly display name for any contact (e.g. "Honza #8D7-2AB" or "Uživatel #8D7-2AB")
 */
export function getDisplayName(name?: string, address?: string): string {
  const shortTag = address ? formatKeccakAddress(address) : '';
  if (name && !name.startsWith('k256:0x') && !name.startsWith('0x') && !name.startsWith('#')) {
    return shortTag ? `${name} ${shortTag}` : name;
  }
  return `Uživatel ${shortTag}`.trim();
}

/**
 * Blind Mailbox Token generator (used for zero-metadata routing)
 * Generates an ephemeral recipient token: KECCAK256(recipientAddress + epochSalt)
 */
export function generateBlindMailboxToken(recipientAddress: string, epochSalt: string): string {
  const combined = utf8ToBytes(`${recipientAddress}:${epochSalt}`);
  return bytesToHex(keccak256(combined));
}

/**
 * Generates a short, memorable 6-character user chat tag (e.g. #8D7-2AB)
 */
export function deriveShortChatTag(address: string): string {
  const clean = address.replace('k256:0x', '').toLowerCase();
  if (clean.length < 6) return address;
  const p1 = clean.slice(0, 3).toUpperCase();
  const p2 = clean.slice(3, 6).toUpperCase();
  return `#${p1}-${p2}`;
}

/**
 * Creates a 1-click shareable invite link for instant chat connection
 */
export function createInviteLink(address: string, username?: string): string {
  const base = window.location.origin + window.location.pathname;
  const params = new URLSearchParams();
  params.set('addr', address);
  if (username) params.set('name', username);
  return `${base}#invite?${params.toString()}`;
}

/**
 * Parses any user input: invite URL, phone number, short tag, @username or full k256 address
 */
export function parseInviteInput(input: string): {
  address?: string;
  username?: string;
  shortTag?: string;
  phoneNumber?: string;
} {
  const trimmed = input.trim();

  // 1. Check if it's an invite link
  if (trimmed.includes('#invite?') || trimmed.includes('?addr=')) {
    try {
      const hashPart = trimmed.split('#invite?')[1] || trimmed.split('?')[1];
      const params = new URLSearchParams(hashPart);
      const addr = params.get('addr');
      const name = params.get('name');
      if (addr) return { address: addr, username: name || undefined };
    } catch {}
  }

  // 2. Check if full k256 address
  if (trimmed.startsWith('k256:0x') || (trimmed.startsWith('0x') && trimmed.length >= 42)) {
    const addr = trimmed.startsWith('k256:0x') ? trimmed : `k256:${trimmed}`;
    return { address: addr };
  }

  // 3. Check if phone number (e.g. +420 777 123 456 or 777123456)
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 9 && /^[\+]?[\d\s\-\.\(\)]+$/.test(trimmed)) {
    let norm = trimmed.replace(/[\s\-\.\(\)]/g, '');
    if (norm.startsWith('00')) norm = '+' + norm.slice(2);
    if (/^\d{9}$/.test(norm)) norm = '+420' + norm;
    if (/^420\d{9}$/.test(norm)) norm = '+' + norm;
    return {
      phoneNumber: norm,
      username: norm,
    };
  }

  // 4. Check if short tag (e.g. #8D7-2AB or 8D72AB or 8D7-2AB)
  const cleanTag = trimmed.replace('#', '').replace('-', '').trim();
  if (cleanTag.length === 6 && /^[0-9a-fA-F]+$/.test(cleanTag)) {
    return { shortTag: cleanTag.toLowerCase() };
  }

  // 5. Treat as username (e.g. @Honza or Honza)
  const cleanName = trimmed.replace('@', '').trim();
  return { username: cleanName };
}

export { bytesToHex, hexToBytes, utf8ToBytes };


