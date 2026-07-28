function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** 0 = без лимита (для Unisender Go). */
function envIntAllowZero(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0.1, n));
}

function useUnisenderGo(): boolean {
  return Boolean(String(process.env.API_UNISENDER_GO || '').trim());
}

/**
 * Лимиты очереди.
 * С Unisender Go Beget-капы не нужны — дефолты выше, daily/hourly = 0 (без потолка).
 * С SMTP (fallback) — прежние жёсткие капы под Beget.
 */
const viaGo = useUnisenderGo();

export const mailQueueConfig = {
  /** Писем за один проход cron */
  queueLimit: envInt('MAIL_QUEUE_LIMIT', viaGo ? 80 : 8),
  broadcastChunkSize: envInt('MAIL_BROADCAST_CHUNK_SIZE', viaGo ? 40 : 5),
  sequenceChunkSize: envInt('MAIL_SEQUENCE_CHUNK_SIZE', viaGo ? 20 : 4),
  broadcastDelayMs: envIntAllowZero('MAIL_BROADCAST_DELAY_MS', viaGo ? 150 : 3000),
  sequenceDelayMs: envIntAllowZero('MAIL_SEQUENCE_DELAY_MS', viaGo ? 150 : 2500),
  broadcastBudgetRatio: envFloat('MAIL_BROADCAST_BUDGET_RATIO', 0.6),
  backgroundRunSeconds: envInt('MAIL_BACKGROUND_RUN_SECONDS', viaGo ? 50 : 35),
  queueInsertBatchSize: envInt('MAIL_QUEUE_INSERT_BATCH_SIZE', 200),
  /** 0 = без дневного потолка (Unisender Go) */
  dailySendCap: envIntAllowZero('MAIL_DAILY_SEND_CAP', viaGo ? 0 : 250),
  /** 0 = без часового потолка (Unisender Go) */
  hourlySendCap: envIntAllowZero('MAIL_HOURLY_SEND_CAP', viaGo ? 0 : 40),
};
