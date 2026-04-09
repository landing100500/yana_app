import User from '@/models/User';

export type PlanCode = 'free' | 'optimal' | 'professional';

export interface PlanConfig {
  code: PlanCode;
  title: string;
  priceRub: number | null;
  durationDays: number | null;
  maxCharts: number | null;
  chartComparison: boolean;
  hasUnlimitedTime: boolean;
  freeMinutesPerWindow?: number;
  freeWindowDays?: number;
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
    freeMinutesPerWindow: 60,
    freeWindowDays: 7,
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
  freeWindowEndsAt: string | null;
  freeMinutesUsed: number | null;
  freeMinutesPerWindow: number | null;
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
  if (value === 'optimal' || value === 'professional' || value === 'free') return value;
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
  const freeWindowStartedAt = getDate((user as any).freeWindowStartedAt);
  let remainingSeconds: number | null = null;
  let freeWindowEndsAt: string | null = null;

  if (!activeConfig.hasUnlimitedTime && activeConfig.freeMinutesPerWindow && activeConfig.freeWindowDays) {
    const cycleMs = activeConfig.freeWindowDays * 24 * 60 * 60 * 1000;
    const sessionMs = activeConfig.freeMinutesPerWindow * 60 * 1000;
    const startedAtMs = freeWindowStartedAt?.getTime() ?? nowMs();
    const elapsed = nowMs() - startedAtMs;
    if (elapsed <= sessionMs) {
      remainingSeconds = Math.max(0, Math.floor((sessionMs - Math.max(0, elapsed)) / 1000));
    } else {
      remainingSeconds = 0;
    }
    freeWindowEndsAt = new Date(startedAtMs + cycleMs).toISOString();
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
    freeWindowEndsAt,
    freeMinutesUsed: null,
    freeMinutesPerWindow: activeCode === 'free' ? activeConfig.freeMinutesPerWindow ?? null : null,
  };
}

export async function ensureFreePlanWindow(user: User): Promise<void> {
  const code = normalizePlanCode((user as any).planCode);
  if (code !== 'free') return;
  const cfg = getPlanConfig('free');
  const cycleMs = (cfg.freeWindowDays ?? 7) * 24 * 60 * 60 * 1000;
  const start = getDate((user as any).freeWindowStartedAt);
  const now = new Date();
  const shouldReset = !start || now.getTime() < start.getTime() || now.getTime() - start.getTime() >= cycleMs;
  if (shouldReset) {
    (user as any).freeWindowStartedAt = now;
    (user as any).freeMinutesUsed = 0;
    await user.save();
  }
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
  if (planCode === 'free') return new Set(nonMain.map((c) => c.id));

  const allowedIds = new Set(nonMain.slice(0, 5).map((c) => c.id));
  const frozen = new Set<number>();
  nonMain.forEach((c) => {
    if (!allowedIds.has(c.id)) frozen.add(c.id);
  });
  return frozen;
}
