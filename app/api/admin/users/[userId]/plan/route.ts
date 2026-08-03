import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initDatabase } from '@/lib/initDb';
import User from '@/models/User';
import {
  getPlanConfig,
  getUserPlanSnapshot,
  parsePlanCode,
  resetPlanDailyUsage,
} from '@/lib/subscription';
import { enrollUserOnPlanPurchase } from '@/lib/mail-marketing';
import { formatMoney } from '@/lib/partner';

export const dynamic = 'force-dynamic';

const ADMIN_MONTH_DAYS = 30;

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

function computeExpiry(params: {
  planCode: string;
  months: number | null;
  startMode: 'from_now' | 'extend';
  currentExpiresAt: Date | null;
}): { assignedAt: Date; expiresAt: Date | null } {
  const cfg = getPlanConfig(params.planCode as any);
  const assignedAt = new Date();

  if (!cfg.durationDays && params.planCode === 'free') {
    return { assignedAt, expiresAt: null };
  }

  let days: number;
  if (params.months != null && params.months > 0) {
    days = Math.floor(params.months) * ADMIN_MONTH_DAYS;
  } else if (cfg.durationDays) {
    days = cfg.durationDays;
  } else {
    return { assignedAt, expiresAt: null };
  }

  let base = assignedAt;
  if (params.startMode === 'extend' && params.currentExpiresAt) {
    const current = new Date(params.currentExpiresAt);
    if (current.getTime() > assignedAt.getTime()) {
      base = current;
    }
  }

  const expiresAt = new Date(base);
  expiresAt.setDate(expiresAt.getDate() + days);
  return { assignedAt, expiresAt };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const userId = Number(params.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Неверный ID пользователя' }, { status: 400 });
    }

    const body = await request.json();
    const planCode = parsePlanCode(body?.planCode);
    if (!planCode) {
      return NextResponse.json({ error: 'Неверный тариф' }, { status: 400 });
    }

    const startMode: 'from_now' | 'extend' =
      body?.startMode === 'extend' ? 'extend' : 'from_now';

    let months: number | null = null;
    if (body?.months != null && body.months !== '') {
      const m = Number(body.months);
      if (!Number.isFinite(m) || m <= 0 || m > 120) {
        return NextResponse.json({ error: 'months: число от 1 до 120' }, { status: 400 });
      }
      months = m;
    }

    let statsAmountRub: string | null | undefined = undefined;
    if (Object.prototype.hasOwnProperty.call(body, 'statsAmountRub')) {
      if (body.statsAmountRub === null || body.statsAmountRub === '') {
        statsAmountRub = null;
      } else {
        const n = Number(body.statsAmountRub);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json({ error: 'statsAmountRub должна быть >= 0' }, { status: 400 });
        }
        statsAmountRub = formatMoney(n);
      }
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    const { assignedAt, expiresAt } = computeExpiry({
      planCode,
      months,
      startMode,
      currentExpiresAt: (user as any).planExpiresAt || null,
    });

    (user as any).planCode = planCode;
    (user as any).planAssignedAt = assignedAt;
    (user as any).planExpiresAt = expiresAt;
    if (planCode === 'free') {
      (user as any).freeAiRequestsUsed = 0;
      (user as any).planManuallyAssignedAt = null;
      (user as any).manualPlanStatsAmountRub = null;
    } else {
      (user as any).planManuallyAssignedAt = new Date();
      if (statsAmountRub !== undefined) {
        (user as any).manualPlanStatsAmountRub = statsAmountRub;
      } else {
        // По умолчанию — цена тарифа (null = брать из PLAN_CONFIGS в статистике)
        (user as any).manualPlanStatsAmountRub = null;
      }
    }
    resetPlanDailyUsage(user);
    await user.save();

    if (planCode !== 'free') {
      try {
        await enrollUserOnPlanPurchase(user.id, planCode);
      } catch (enrollError) {
        console.error('Admin plan sequence enroll failed', { userId: user.id, planCode, enrollError });
      }
    }

    return NextResponse.json({
      success: true,
      plan: getUserPlanSnapshot(user),
      startMode,
      months,
      statsAmountRub: (user as any).manualPlanStatsAmountRub,
    });
  } catch (error: any) {
    console.error('Admin update plan error:', error);
    return NextResponse.json({ error: 'Ошибка при обновлении тарифа' }, { status: 500 });
  }
}
