import AppSetting from '@/models/AppSetting';
import {
  FREE_AI_REQUESTS_FOR_NEW_USERS_KEY,
  FREE_AI_REQUESTS_LIMIT,
  FREE_AI_REMAINING_SQL,
  resolveUserFreeAiRequestsLimit,
} from '@/lib/free-ai-requests-constants';

export {
  FREE_AI_REQUESTS_FOR_NEW_USERS_KEY,
  FREE_AI_REQUESTS_LIMIT,
  FREE_AI_REMAINING_SQL,
  resolveUserFreeAiRequestsLimit,
};

const MIN_LIMIT = 0;
const MAX_LIMIT = 10_000;

function parseLimit(raw: string | null | undefined, fallback: number): number {
  if (raw == null || raw === '') return fallback;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(n)));
}

/** Лимит бесплатных запросов, который получат новые регистрации. */
export async function getFreeAiRequestsForNewUsers(): Promise<number> {
  try {
    const row = await AppSetting.findByPk(FREE_AI_REQUESTS_FOR_NEW_USERS_KEY);
    return parseLimit(row?.value, FREE_AI_REQUESTS_LIMIT);
  } catch {
    return FREE_AI_REQUESTS_LIMIT;
  }
}

export async function setFreeAiRequestsForNewUsers(value: number): Promise<number> {
  if (!Number.isFinite(value)) {
    throw new Error('Invalid free AI requests limit');
  }
  const next = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(value)));
  await AppSetting.upsert({
    key: FREE_AI_REQUESTS_FOR_NEW_USERS_KEY,
    value: String(next),
  });
  return next;
}
