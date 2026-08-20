import { describe, it, expect } from 'vitest';
import {
  normalizePhoneNumber,
  formatPhoneDisplay,
  isPhoneNumber,
  generateSmsCode,
} from '../crypto/phone';
import { parseInviteInput } from '../crypto/keccak';

describe('Phone Number Utilities & Auth (+420)', () => {
  it('normalizes 9-digit Czech numbers by auto-prepending +420', () => {
    expect(normalizePhoneNumber('777123456')).toBe('+420777123456');
    expect(normalizePhoneNumber('777 123 456')).toBe('+420777123456');
    expect(normalizePhoneNumber('777-123-456')).toBe('+420777123456');
  });

  it('normalizes international numbers and removes spaces and formatting', () => {
    expect(normalizePhoneNumber('+420 777 123 456')).toBe('+420777123456');
    expect(normalizePhoneNumber('00420 777 123 456')).toBe('+420777123456');
    expect(normalizePhoneNumber('+421 905 123 456')).toBe('+421905123456');
  });

  it('formats phone numbers nicely for Czech display', () => {
    expect(formatPhoneDisplay('+420777123456')).toBe('+420 777 123 456');
    expect(formatPhoneDisplay('777123456')).toBe('+420 777 123 456');
    expect(formatPhoneDisplay('+421905123456')).toBe('+421 905 123 456');
  });

  it('correctly detects phone numbers vs nicknames', () => {
    expect(isPhoneNumber('+420 777 123 456')).toBe(true);
    expect(isPhoneNumber('777123456')).toBe(true);
    expect(isPhoneNumber('777 123 456')).toBe(true);
    expect(isPhoneNumber('Honza')).toBe(false);
    expect(isPhoneNumber('@ladislav')).toBe(false);
  });

  it('generates secure 6-digit numeric SMS OTP codes', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateSmsCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('parseInviteInput parses phone numbers seamlessly', () => {
    const res1 = parseInviteInput('+420 777 123 456');
    expect(res1.phoneNumber).toBe('+420777123456');

    const res2 = parseInviteInput('777 123 456');
    expect(res2.phoneNumber).toBe('+420777123456');
  });
});
