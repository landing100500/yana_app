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

/** Лимиты очереди. Дефолты ≈ текущее поведение на малых объёмах; для 1k+ см. docs/MAILING_AT_SCALE.md */
export const mailQueueConfig = {
  queueLimit: envInt('MAIL_QUEUE_LIMIT', 30),
  broadcastChunkSize: envInt('MAIL_BROADCAST_CHUNK_SIZE', 20),
  sequenceChunkSize: envInt('MAIL_SEQUENCE_CHUNK_SIZE', 15),
  broadcastDelayMs: envInt('MAIL_BROADCAST_DELAY_MS', 500),
  sequenceDelayMs: envInt('MAIL_SEQUENCE_DELAY_MS', 500),
  broadcastBudgetRatio: envFloat('MAIL_BROADCAST_BUDGET_RATIO', 0.6),
  backgroundRunSeconds: envInt('MAIL_BACKGROUND_RUN_SECONDS', 45),
  queueInsertBatchSize: envInt('MAIL_QUEUE_INSERT_BATCH_SIZE', 200),
};
