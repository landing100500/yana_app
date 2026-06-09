import User from '@/models/User';

export type PlanCode = 'free' | 'hours24' | 'optimal' | 'professional';

export const FREE_PROMO_MONTHS = 4;
export const FREE_AI_REQUESTS_LIMIT = 10;

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
}

export interface ChartLikeForFreeze {
  id: number;
  isMain?: boolean;
  createdAt?: string | Date;
}

function nowMs(): number {
  return Date.now();
}

function normalizePlanCode(value: unknown): PlanCode {
  if (value === 'hours24' || value === 'optimal' || value === 'professional' || value === 'free') {
    return value;
  }
  return 'free';
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

  if (!activeConfig.hasUnlimitedTime) {
    if (activeConfig.sessionMinutesFromPlanStart && planAssignedAt) {
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
