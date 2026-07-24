import { Op } from 'sequelize';
import AppSetting from '@/models/AppSetting';
import MailSend from '@/models/MailSend';
import { mailQueueConfig } from '@/lib/mail-queue-config';

const MARKETING_PAUSE_KEY = 'mail_marketing_paused';

export type MarketingPauseState = {
  paused: boolean;
  reason: string | null;
  pausedAt: string | null;
};

type PausePayload = {
  reason?: string;
  pausedAt?: string;
};

function parsePauseValue(raw: string | null | undefined): MarketingPauseState {
  if (!raw || raw === 'false' || raw === '0') {
    return { paused: false, reason: null, pausedAt: null };
  }
  if (raw === 'true' || raw === '1') {
    return { paused: true, reason: 'manual', pausedAt: null };
  }
  try {
    const parsed = JSON.parse(raw) as PausePayload & { paused?: boolean };
    if (parsed && (parsed.paused === true || parsed.reason || parsed.pausedAt)) {
      return {
        paused: true,
        reason: parsed.reason || 'paused',
        pausedAt: parsed.pausedAt || null,
      };
    }
  } catch {
    /* plain reason string */
  }
  return { paused: true, reason: raw, pausedAt: null };
}

export async function getMarketingPauseState(): Promise<MarketingPauseState> {
  const row = await AppSetting.findByPk(MARKETING_PAUSE_KEY);
  return parsePauseValue(row?.value);
}

export async function isMarketingMailPaused(): Promise<boolean> {
  const state = await getMarketingPauseState();
  return state.paused;
}

/** Только ручная пауза или бан ящика Beget — не трогает pending. */
export async function pauseMarketingMail(reason: string): Promise<void> {
  const payload: PausePayload = {
    reason: reason.slice(0, 1000),
    pausedAt: new Date().toISOString(),
  };
  await AppSetting.upsert({
    key: MARKETING_PAUSE_KEY,
    value: JSON.stringify(payload),
  });
  console.error('[mail-send-guard] MARKETING PAUSED:', reason);
}

export async function resumeMarketingMail(): Promise<void> {
  await AppSetting.upsert({
    key: MARKETING_PAUSE_KEY,
    value: 'false',
  });
  console.log('[mail-send-guard] marketing resumed');
}

export async function countMarketingSentSince(since: Date): Promise<number> {
  return MailSend.count({
    where: {
      status: 'sent',
      sentAt: { [Op.gte]: since },
    },
  });
}

export async function countMarketingSentToday(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return countMarketingSentSince(start);
}

export async function countMarketingSentLastHour(): Promise<number> {
  return countMarketingSentSince(new Date(Date.now() - 60 * 60 * 1000));
}

export async function getMarketingSendBudget(): Promise<{
  sentToday: number;
  sentLastHour: number;
  dailyCap: number;
  hourlyCap: number;
  remainingToday: number;
  remainingHour: number;
  remaining: number;
  paused: MarketingPauseState;
}> {
  const [sentToday, sentLastHour, paused] = await Promise.all([
    countMarketingSentToday(),
    countMarketingSentLastHour(),
    getMarketingPauseState(),
  ]);
  const dailyCap = mailQueueConfig.dailySendCap;
  const hourlyCap = mailQueueConfig.hourlySendCap;
  const remainingToday = Math.max(0, dailyCap - sentToday);
  const remainingHour = Math.max(0, hourlyCap - sentLastHour);
  return {
    sentToday,
    sentLastHour,
    dailyCap,
    hourlyCap,
    remainingToday,
    remainingHour,
    remaining: Math.min(remainingToday, remainingHour),
    paused,
  };
}

/**
 * Можно ли сейчас слать маркетинг.
 * При капе pending НЕ трогаем — просто ждём следующий час/день.
 * OTP этим не блокируется.
 */
export async function assertMarketingSendAllowed(): Promise<{
  ok: boolean;
  reason?: string;
  remaining?: number;
}> {
  const paused = await getMarketingPauseState();
  if (paused.paused) {
    return {
      ok: false,
      reason: paused.reason || 'Маркетинговая отправка приостановлена (бан SMTP или ручная пауза)',
    };
  }

  const budget = await getMarketingSendBudget();
  if (budget.remainingHour <= 0) {
    return {
      ok: false,
      reason: `Часовой лимит (${budget.sentLastHour}/${budget.hourlyCap}). Pending ждут — продолжим через час.`,
      remaining: 0,
    };
  }
  if (budget.remainingToday <= 0) {
    return {
      ok: false,
      reason: `Дневной лимит (${budget.sentToday}/${budget.dailyCap}). Pending ждут — продолжим завтра.`,
      remaining: 0,
    };
  }

  return { ok: true, remaining: budget.remaining };
}
