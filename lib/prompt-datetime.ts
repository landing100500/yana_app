/**
 * Текущие дата/время на сервере в момент вызова API — подставлять в system-промпты,
 * чтобы модель не «застревала» на устаревшем календарном годе (аналог {{ $now }} в n8n).
 *
 * Часовой пояс: APP_PROMPT_TIMEZONE (IANA), по умолчанию Europe/Moscow.
 */
export function getPromptServerNowBlock(now: Date = new Date()): string {
  const iso = now.toISOString();
  const tz = (process.env.APP_PROMPT_TIMEZONE || 'Europe/Moscow').trim() || 'Europe/Moscow';
  let localLine: string;
  try {
    localLine = new Intl.DateTimeFormat('ru-RU', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'long',
    }).format(now);
  } catch {
    localLine = new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'long',
    }).format(now);
  }

  return (
    '--- ТЕКУЩИЕ ДАТА И ВРЕМЯ (источник истины для «сегодня», календарного года, возраста, транзитов и любых формулировок про «сейчас»; не опирайся на внутреннее представление модели о дате) ---\n'
    + `UTC (ISO-8601): ${iso}\n`
    + `Локально (${tz}): ${localLine}\n`
    + '--- конец блока даты/времени ---\n\n'
  );
}
