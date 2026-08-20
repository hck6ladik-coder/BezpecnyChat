/**
 * Pomocné funkce pro práci s telefonními čísly a SMS ověřováním
 */

export const normalizePhoneNumber = (raw: string): string => {
  if (!raw) return '';
  const trimmed = raw.trim();
  
  // Pokud neobsahuje číslice, vrátit ořezaný text
  if (!/\d/.test(trimmed)) {
    return trimmed;
  }

  // Odstranit mezery, pomlčky, tečky, závorky
  let cleaned = trimmed.replace(/[\s\-\.\(\)]/g, '');

  // Nahradit 00 na začátku znakem +
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  // Pokud je to 9místné číslo bez předvolby (např. 777123456), přidat +420
  if (/^\d{9}$/.test(cleaned)) {
    cleaned = '+420' + cleaned;
  }

  // Pokud začíná bez +, ale má předvolbu např. 420777123456
  if (/^420\d{9}$/.test(cleaned)) {
    cleaned = '+' + cleaned;
  }

  return cleaned;
};

export const formatPhoneDisplay = (phone: string): string => {
  if (!phone) return '';
  const normalized = normalizePhoneNumber(phone);
  
  // Formát +420 777 123 456
  if (normalized.startsWith('+420') && normalized.length === 13) {
    return `+420 ${normalized.slice(4, 7)} ${normalized.slice(7, 10)} ${normalized.slice(10)}`;
  }
  
  // Formát +421 905 123 456
  if (normalized.startsWith('+421') && normalized.length === 13) {
    return `+421 ${normalized.slice(4, 7)} ${normalized.slice(7, 10)} ${normalized.slice(10)}`;
  }

  // Obecný formát s mezerami po 3 číslicích
  if (normalized.startsWith('+')) {
    const prefix = normalized.slice(0, 4);
    const rest = normalized.slice(4);
    const chunks = rest.match(/.{1,3}/g) || [];
    return `${prefix} ${chunks.join(' ')}`;
  }

  return phone;
};

export const isPhoneNumber = (input: string): boolean => {
  if (!input) return false;
  const digitsOnly = input.replace(/\D/g, '');
  return digitsOnly.length >= 6 && /^[\+]?[\d\s\-\.\(\)]+$/.test(input.trim());
};

export const generateSmsCode = (): string => {
  const digits = '0123456789';
  let code = '';
  const randomValues = new Uint8Array(6);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 6; i++) {
    code += digits[randomValues[i] % 10];
  }
  return code;
};
