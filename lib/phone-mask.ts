/**
 * Маска ввода РФ: только цифры, отображение +7 (XXX) XXX-XX-XX.
 * Внутренне накапливается не более 11 цифр 7XXXXXXXXXX.
 */

const MAX = 11;

/** Извлекает цифры и приводит к виду 7 + до 10 следующих цифр. */
export function normalizeDigitsTo7Eleven(rawDigits: string): string {
  let d = rawDigits.replace(/\D/g, '');
  if (!d) return '';
  if (d[0] === '8') d = '7' + d.slice(1);
  if (d[0] !== '7') d = '7' + d;
  return d.slice(0, MAX);
}

/** Строка для поля ввода после любого изменения (ввод, вставка, удаление). */
export function applyRuPhoneMask(rawInput: string): string {
  const full = normalizeDigitsTo7Eleven(rawInput);
  return formatRuPhoneDisplay(full);
}

function formatRuPhoneDisplay(full: string): string {
  if (!full) return '';
  if (full[0] !== '7') return '+7 ';
  const r = full.slice(1);
  if (r.length === 0) return '+7 ';

  if (r.length <= 3) {
    return r.length < 3 ? `+7 (${r}` : `+7 (${r}) `;
  }

  const a = r.slice(0, 3);
  const b = r.slice(3, 6);
  const c = r.slice(6, 8);
  const e = r.slice(8, 10);

  if (r.length <= 6) {
    return `+7 (${a}) ${b}`;
  }
  if (r.length <= 8) {
    return `+7 (${a}) ${b}-${c}`;
  }
  return `+7 (${a}) ${b}-${c}-${e}`;
}

export const RU_PHONE_PLACEHOLDER = '+7 (999) 123-45-67';

/** Длина отформатированного полного номера. */
export const RU_PHONE_MASK_MAX_LEN = RU_PHONE_PLACEHOLDER.length;
