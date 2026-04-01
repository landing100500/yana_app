/**
 * Нормализация российского номера к виду 7XXXXXXXXXX (11 цифр).
 */
export function normalizeRuPhoneDigits(input: string): string | null {
  const d = input.replace(/\D/g, '');
  if (d.length === 10 && d[0] === '9') {
    return `7${d}`;
  }
  if (d.length === 11 && d[0] === '8') {
    return `7${d.slice(1)}`;
  }
  if (d.length === 11 && d[0] === '7') {
    return d;
  }
  return null;
}
