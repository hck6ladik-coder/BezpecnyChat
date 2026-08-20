import { keccak256, keccak256Hex, bytesToHex, hexToBytes, utf8ToBytes } from './keccak';
import { ed25519 } from '@noble/curves/ed25519';

/**
 * Authentication Module:
 * - Web3 / SIWE (Sign-In with Ethereum) passwordless authentication
 * - TOTP 2FA (RFC 6238) with KECCAK/SHA HMAC
 * - Cryptographic Backup Codes
 */

export interface SiweMessageData {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
}

export interface TotpSetupData {
  secretBase32: string;
  secretBytesHex: string;
  provisioningUri: string;
  backupCodes: string[];
  backupCodeHashes: string[];
}

/**
 * Generate formatted SIWE authentication message
 */
export function formatSiweMessage(data: SiweMessageData): string {
  return `${data.domain} wants you to sign in with your Keccak account:
${data.address}

${data.statement}

URI: ${data.uri}
Version: ${data.version}
Chain ID: ${data.chainId}
Nonce: ${data.nonce}
Issued At: ${data.issuedAt}`;
}

/**
 * Sign SIWE message using private key (Ed25519)
 */
export function signSiweMessage(message: string, privateKeyBytes: Uint8Array): {
  signatureHex: string;
  messageHashHex: string;
} {
  const msgHash = keccak256(utf8ToBytes(message));
  const sig = ed25519.sign(msgHash, privateKeyBytes);
  return {
    signatureHex: bytesToHex(sig),
    messageHashHex: bytesToHex(msgHash),
  };
}

/**
 * Verify SIWE message signature
 */
export function verifySiweSignature(
  message: string,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  try {
    const msgHash = keccak256(utf8ToBytes(message));
    return ed25519.verify(hexToBytes(signatureHex), msgHash, hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function bytesToBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * HMAC-SHA1 implementation for standard TOTP
 */
async function hmacSha1(keyBytes: Uint8Array, messageBytes: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, messageBytes as unknown as BufferSource);
  return new Uint8Array(sig);
}

/**
 * Generate 6-digit TOTP code for a given timestamp
 */
export async function generateTotpCode(
  secretBytes: Uint8Array,
  timeMs: number = Date.now(),
  stepSec: number = 30
): Promise<string> {
  const counter = Math.floor(timeMs / 1000 / stepSec);
  const counterBytes = new Uint8Array(8);
  let temp = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = temp & 0xff;
    temp = Math.floor(temp / 256);
  }

  const hmacResult = await hmacSha1(secretBytes, counterBytes);
  const offset = hmacResult[hmacResult.length - 1] & 0x0f;
  const binaryCode =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);

  const otp = binaryCode % 1_000_000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verify TOTP Code with ±1 step window for clock tolerance
 */
export async function verifyTotpCode(
  secretBytes: Uint8Array,
  inputCode: string,
  timeMs: number = Date.now(),
  stepSec: number = 30
): Promise<boolean> {
  const trimmed = inputCode.trim();
  const windows = [-1, 0, 1];

  for (const w of windows) {
    const testTime = timeMs + w * stepSec * 1000;
    const expected = await generateTotpCode(secretBytes, testTime, stepSec);
    if (expected === trimmed) {
      return true;
    }
  }
  return false;
}

/**
 * Generate TOTP 2FA Setup with 8 Keccak-hashed backup codes
 */
export function generateTotpSetup(username: string, issuer: string = 'KeccakSecureChat'): TotpSetupData {
  const secretBytes = crypto.getRandomValues(new Uint8Array(20));
  const secretBase32 = bytesToBase32(secretBytes);
  const secretBytesHex = bytesToHex(secretBytes);

  const provisioningUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(
    username
  )}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

  const backupCodes: string[] = [];
  const backupCodeHashes: string[] = [];

  for (let i = 0; i < 8; i++) {
    const randomHex = bytesToHex(crypto.getRandomValues(new Uint8Array(4))).toUpperCase();
    const code = `${randomHex.slice(0, 4)}-${randomHex.slice(4, 8)}`;
    backupCodes.push(code);
    backupCodeHashes.push(keccak256Hex(code));
  }

  return {
    secretBase32,
    secretBytesHex,
    provisioningUri,
    backupCodes,
    backupCodeHashes,
  };
}

/**
 * Verify backup code against stored hashes and invalidate if valid
 */
export function verifyBackupCode(
  inputCode: string,
  storedHashes: string[]
): { isValid: boolean; remainingHashes: string[] } {
  const hash = keccak256Hex(inputCode.trim().toUpperCase());
  const index = storedHashes.findIndex((h) => h.toLowerCase() === hash.toLowerCase());

  if (index !== -1) {
    const remaining = [...storedHashes];
    remaining.splice(index, 1);
    return { isValid: true, remainingHashes: remaining };
  }

  return { isValid: false, remainingHashes: storedHashes };
}
