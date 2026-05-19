/** Допустимая длина номера в цифрах: 11 (+7) или 12 (+375). */
export const PHONE_DIGIT_LENGTHS = [11, 12] as const;

export const PHONE_PLACEHOLDER = 'Введите телефон';

export function extractPhoneDigits(input: string): string {
  return input.replace(/\D/g, '');
}

export function isValidPhoneLength(input: string): boolean {
  const len = extractPhoneDigits(input).length;
  return PHONE_DIGIT_LENGTHS.includes(len as (typeof PHONE_DIGIT_LENGTHS)[number]);
}

export function normalizePhoneDigits(input: string): string | null {
  const d = extractPhoneDigits(input);
  if (!PHONE_DIGIT_LENGTHS.includes(d.length as (typeof PHONE_DIGIT_LENGTHS)[number])) {
    return null;
  }
  return d;
}

/** @deprecated используйте normalizePhoneDigits */
export const normalizeRuPhoneDigits = normalizePhoneDigits;

export function formatPhoneValidationError(): string {
  return 'Номер телефона должен содержать 11 или 12 цифр';
}
