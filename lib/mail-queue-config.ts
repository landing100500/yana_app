function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0.1, n));
}

/**
 * Лимиты под Beget shared SMTP.
 * Pending НЕ отменяются — при исчерпании капа очередь просто ждёт до следующего часа/дня.
 */
export const mailQueueConfig = {
  /** Писем за один проход cron (~каждые 2 мин) */
  queueLimit: envInt('MAIL_QUEUE_LIMIT', 8),
  broadcastChunkSize: envInt('MAIL_BROADCAST_CHUNK_SIZE', 5),
  sequenceChunkSize: envInt('MAIL_SEQUENCE_CHUNK_SIZE', 4),
  broadcastDelayMs: envInt('MAIL_BROADCAST_DELAY_MS', 3000),
  sequenceDelayMs: envInt('MAIL_SEQUENCE_DELAY_MS', 2500),
  broadcastBudgetRatio: envFloat('MAIL_BROADCAST_BUDGET_RATIO', 0.6),
  backgroundRunSeconds: envInt('MAIL_BACKGROUND_RUN_SECONDS', 35),
  queueInsertBatchSize: envInt('MAIL_QUEUE_INSERT_BATCH_SIZE', 200),
  /** Потолок sent за сутки UTC — растягивает большую очередь на несколько дней */
  dailySendCap: envInt('MAIL_DAILY_SEND_CAP', 250),
  /** Потолок за скользящий час — не выплёвывать весь дневной кап за первый час */
  hourlySendCap: envInt('MAIL_HOURLY_SEND_CAP', 40),
};
