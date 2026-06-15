import User from '@/models/User';

export type PlanCode = 'free' | 'hours24' | 'optimalLight' | 'optimal' | 'professional';

export const FREE_PROMO_MONTHS = 4;
export const FREE_AI_REQUESTS_LIMIT = 10;

const MOSCOW_TZ = 'Europe/Moscow';

export interface PlanConfig {
  code: PlanCode;
  title: string;
  priceRub: number | null;
  durationDays: number | null;
  maxCharts: number | null;
  chartComparison: boolean;
  hasUnlimitedTime: boolean;
  /** Минуты сессии от planAssignedAt (тариф «24 часа»). */
  sessionMinutesFromPlanStart?: number;
  /** Лимит минут в сутки (тариф «Оптимальный Лайт»). */
  dailyMinutesLimit?: number;
  /** Лимит запросов к ИИ на бесплатном тарифе. */
  freeAiRequestsLimit?: number;
}

export const PLAN_CONFIGS: Record<PlanCode, PlanConfig> = {
  free: {
    code: 'free',
    title: 'Бесплатный',
    priceRub: null,
    durationDays: null,
    maxCharts: 0,
    chartComparison: false,
    hasUnlimitedTime: false,
    freeAiRequestsLimit: FREE_AI_REQUESTS_LIMIT,
  },
  hours24: {
    code: 'hours24',
    title: '24 часа',
    priceRub: 900,
    durationDays: 1,
    maxCharts: 0,
    chartComparison: false,
    hasUnlimitedTime: false,
    sessionMinutesFromPlanStart: 24 * 60,
  },
  optimalLight: {
    code: 'optimalLight',
    title: 'Оптимальный Лайт',
    priceRub: 2990,
    durationDays: 30,
    maxCharts: 5,
    chartComparison: true,
    hasUnlimitedTime: false,
    dailyMinutesLimit: 60,
  },
  optimal: {
    code: 'optimal',
    title: 'Оптимальный',
    priceRub: 9900,
    durationDays: 30,
    maxCharts: 5,
    chartComparison: true,
    hasUnlimitedTime: true,
  },
  professional: {
    code: 'professional',
    title: 'Профессиональный',
    priceRub: 49000,
    durationDays: 180,
    maxCharts: null,
    chartComparison: true,
    hasUnlimitedTime: true,
  },
};

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

export function normalizePlanCode(value: unknown): PlanCode {
  const raw = String(value || '').toLowerCase();
  if (raw === 'optimallight') return 'optimalLight';
  if (raw === 'hours24' || raw === 'optimal' || raw === 'professional' || raw === 'free') {
    return raw;
  }
  return 'free';
}

export function parsePlanCode(value: unknown): PlanCode | null {
  const raw = String(value || '').toLowerCase();
  if (raw === 'optimallight') return 'optimalLight';
  if (raw === 'hours24' || raw === 'optimal' || raw === 'professional' || raw === 'free') {
    return raw;
  }
  return null;
}

export function getPlanConfig(codeLike: unknown): PlanConfig {
  const code = normalizePlanCode(codeLike);
  return PLAN_CONFIGS[code];
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
      remainingAiRequests = Math.max(0, activeConfig.freeAiRequestsLimit - used);
    }
  }

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
    freeAiRequestsLimit: activeCode === 'free' ? activeConfig.freeAiRequestsLimit ?? null : null,
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
