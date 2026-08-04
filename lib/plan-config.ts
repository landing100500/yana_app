import { FREE_AI_REQUESTS_LIMIT } from '@/lib/free-ai-requests-constants';

export type PlanCode = 'free' | 'hours24' | 'optimalLight' | 'optimal' | 'professional';

export const FREE_PROMO_MONTHS = 4;

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
