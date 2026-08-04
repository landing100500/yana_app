import User from '@/models/User';
import {
  FREE_AI_REQUESTS_LIMIT,
  resolveUserFreeAiRequestsLimit,
} from '@/lib/free-ai-requests-constants';
import {
  FREE_PROMO_MONTHS,
  PLAN_CONFIGS,
  getPlanConfig,
  normalizePlanCode,
  parsePlanCode,
  type PlanCode,
  type PlanConfig,
} from '@/lib/plan-config';

export type { PlanCode, PlanConfig };
export {
  FREE_AI_REQUESTS_LIMIT,
  FREE_PROMO_MONTHS,
  PLAN_CONFIGS,
  getPlanConfig,
  normalizePlanCode,
  parsePlanCode,
};

const MOSCOW_TZ = 'Europe/Moscow';

export interface UserPlanSnapshot {
  code: PlanCode;
  title: string;
  isActive: boolean;
  expiresAt: string | null;
  maxCharts: number | null;
  chartComparison: boolean;
  hasUnlimitedTime: boolean;
  remainingSeconds: number | null;
  remainingAiRequests: number | null;
  freeAiRequestsLimit: number | null;
  /** true для тарифов с дневным лимитом времени */
  hasDailyTimeLimit?: boolean;
}

export interface ChartLikeForFreeze {
  id: number;
  isMain?: boolean;
  createdAt?: string | Date;
}

function nowMs(): number {
  return Date.now();
}

function getMoscowDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MOSCOW_TZ }).format(date);
}

function getDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function getDailySecondsUsed(user: User, today: string): number {
  const windowDate = String((user as any).planDailyWindowDate || '');
  if (windowDate !== today) return 0;

  const storedSeconds = Number((user as any).planDailySecondsUsed) || 0;
  const lastTick = getDate((user as any).planDailyLastTickAt);
  if (!lastTick) return storedSeconds;

  const elapsed = Math.floor((nowMs() - lastTick.getTime()) / 1000);
  return storedSeconds + Math.max(0, elapsed);
}

export function resetPlanDailyUsage(user: User): void {
  (user as any).planDailySecondsUsed = 0;
  (user as any).planDailyWindowDate = getMoscowDateKey();
  (user as any).planDailyLastTickAt = new Date();
}

/** Синхронизирует учёт дневного времени (МСК) и сохраняет пользователя при изменениях. */
export async function syncPlanDailyUsage(user: User): Promise<void> {
  const code = normalizePlanCode((user as any).planCode);
  const config = getPlanConfig(code);
  if (!config.dailyMinutesLimit) return;

  const today = getMoscowDateKey();
  const windowDate = String((user as any).planDailyWindowDate || '');
  let dirty = false;

  if (windowDate !== today) {
    resetPlanDailyUsage(user);
    dirty = true;
  } else {
    const limitSeconds = config.dailyMinutesLimit * 60;
    const usedBefore = getDailySecondsUsed(user, today);
    const cappedUsed = Math.min(usedBefore, limitSeconds);
    const storedSeconds = Number((user as any).planDailySecondsUsed) || 0;

    if (cappedUsed !== storedSeconds || !getDate((user as any).planDailyLastTickAt)) {
      (user as any).planDailySecondsUsed = cappedUsed;
      (user as any).planDailyLastTickAt = new Date();
      dirty = true;
    }
  }

  if (dirty) await user.save();
}

export function getUserPlanSnapshot(user: User): UserPlanSnapshot {
  const code = normalizePlanCode((user as any).planCode);
  const config = getPlanConfig(code);
  const expiresAtDate = getDate((user as any).planExpiresAt);
  const isLimitedPlan = code !== 'free';
  const isExpired = isLimitedPlan && expiresAtDate ? expiresAtDate.getTime() <= nowMs() : false;
  const activeCode: PlanCode = isExpired ? 'free' : code;
  const activeConfig = getPlanConfig(activeCode);
  const planAssignedAt = getDate((user as any).planAssignedAt);
  let remainingSeconds: number | null = null;
  let remainingAiRequests: number | null = null;
  const hasDailyTimeLimit = !!activeConfig.dailyMinutesLimit;

  if (!activeConfig.hasUnlimitedTime) {
    if (activeConfig.dailyMinutesLimit) {
      const today = getMoscowDateKey();
      const usedSeconds = getDailySecondsUsed(user, today);
      const limitSeconds = activeConfig.dailyMinutesLimit * 60;
      remainingSeconds = Math.max(0, limitSeconds - usedSeconds);
    } else if (activeConfig.sessionMinutesFromPlanStart && planAssignedAt) {
      const sessionMs = activeConfig.sessionMinutesFromPlanStart * 60 * 1000;
      const elapsed = nowMs() - planAssignedAt.getTime();
      remainingSeconds = Math.max(0, Math.floor((sessionMs - Math.max(0, elapsed)) / 1000));
    } else if (activeConfig.freeAiRequestsLimit != null) {
      const used = Number((user as any).freeAiRequestsUsed) || 0;
      const limit = resolveUserFreeAiRequestsLimit(user as any);
      remainingAiRequests = Math.max(0, limit - used);
    }
  }

  const userFreeLimit =
    activeCode === 'free' ? resolveUserFreeAiRequestsLimit(user as any) : null;

  return {
    code: activeCode,
    title: activeConfig.title,
    isActive: true,
    expiresAt: activeCode === 'free' ? null : (expiresAtDate ? expiresAtDate.toISOString() : null),
    maxCharts: activeConfig.maxCharts,
    chartComparison: activeConfig.chartComparison,
    hasUnlimitedTime: activeConfig.hasUnlimitedTime,
    remainingSeconds,
    remainingAiRequests,
    freeAiRequestsLimit: userFreeLimit,
    hasDailyTimeLimit,
  };
}

/** @deprecated Оставлено для совместимости вызовов — окно по минутам больше не используется. */
export async function ensureFreePlanWindow(_user: User): Promise<void> {
  // no-op
}

export async function consumeFreeAiRequest(user: User): Promise<void> {
  const snapshot = getUserPlanSnapshot(user);
  if (snapshot.code !== 'free') return;
  const used = Number((user as any).freeAiRequestsUsed) || 0;
  (user as any).freeAiRequestsUsed = used + 1;
  await user.save();
}

export function canCreateMoreCharts(snapshot: UserPlanSnapshot, existingChartCount: number): boolean {
  if (snapshot.maxCharts === null) return true;
  return existingChartCount < snapshot.maxCharts;
}

export function assignPlanDates(planCode: PlanCode): { assignedAt: Date; expiresAt: Date | null } {
  const cfg = getPlanConfig(planCode);
  const assignedAt = new Date();
  if (!cfg.durationDays) return { assignedAt, expiresAt: null };
  const expiresAt = new Date(assignedAt);
  expiresAt.setDate(expiresAt.getDate() + cfg.durationDays);
  return { assignedAt, expiresAt };
}

export function getFrozenChartIdsForPlan(planCodeLike: unknown, charts: ChartLikeForFreeze[]): Set<number> {
  const planCode = normalizePlanCode(planCodeLike);
  const nonMain = [...charts]
    .filter((c) => !c.isMain)
    .sort((a, b) => {
      const ad = new Date(a.createdAt || 0).getTime();
      const bd = new Date(b.createdAt || 0).getTime();
      return bd - ad;
    });

  if (planCode === 'professional') return new Set<number>();
  if (planCode === 'free' || planCode === 'hours24') return new Set(nonMain.map((c) => c.id));

  const allowedIds = new Set(nonMain.slice(0, 5).map((c) => c.id));
  const frozen = new Set<number>();
  nonMain.forEach((c) => {
    if (!allowedIds.has(c.id)) frozen.add(c.id);
  });
  return frozen;
}
