/** Клиент-безопасные константы (без Sequelize / AppSetting). */

export const FREE_AI_REQUESTS_LIMIT = 6;

/** Остаток бесплатных AI-запросов (SQL; алиас модели Sequelize — `User`). */
export const FREE_AI_REMAINING_SQL = `GREATEST(
  0,
  CAST(COALESCE(\`User\`.freeAiRequestsLimit, ${FREE_AI_REQUESTS_LIMIT}) AS SIGNED)
  - CAST(COALESCE(\`User\`.freeAiRequestsUsed, 0) AS SIGNED)
)`;

export const FREE_AI_REQUESTS_FOR_NEW_USERS_KEY = 'free_ai_requests_for_new_users';

/** Персональный лимит юзера (зафиксирован при регистрации / выдаче free). */
export function resolveUserFreeAiRequestsLimit(user: {
  freeAiRequestsLimit?: number | null;
}): number {
  const stamped = Number(user.freeAiRequestsLimit);
  if (Number.isFinite(stamped) && stamped >= 0) return Math.floor(stamped);
  return FREE_AI_REQUESTS_LIMIT;
}

/** «1 запрос» / «2 запроса» / «5 запросов» */
export function pluralizeAiRequests(count: number): string {
  const n = Math.abs(Math.floor(count)) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return 'запросов';
  if (last === 1) return 'запрос';
  if (last >= 2 && last <= 4) return 'запроса';
  return 'запросов';
}

export function formatFreeAiRequestsFeature(count: number): string {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return `${n} ${pluralizeAiRequests(n)} к ИИ`;
}

export function formatFreeAiRequestsGiftMeta(count: number): string {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return `${n} ${pluralizeAiRequests(n)} к ИИ в подарок`;
}
