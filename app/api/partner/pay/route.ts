import { NextRequest, NextResponse } from 'next/server';
import sequelize from '@/lib/db';
import { Transaction } from 'sequelize';
import { initDatabase } from '@/lib/initDb';
import { getAuthenticatedUserId } from '@/lib/auth-user';
import { applyBalanceChange, getOrCreatePartnerProfile, parseMoney } from '@/lib/partner';
import {
  assignPlanDates,
  getPlanConfig,
  getUserPlanSnapshot,
  normalizePlanCode,
  PlanCode,
  resetPlanDailyUsage,
} from '@/lib/subscription';
import User from '@/models/User';
import { enrollUserOnPlanPurchase } from '@/lib/mail-marketing';

export const dynamic = 'force-dynamic';

const PAID_PLANS: PlanCode[] = ['hours24', 'optimalLight', 'optimal', 'professional'];

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const planCode = normalizePlanCode(body?.planCode);
    if (!PAID_PLANS.includes(planCode)) {
      return NextResponse.json({ error: 'Неверный тариф' }, { status: 400 });
    }

    const planConfig = getPlanConfig(planCode);
    if (!planConfig.priceRub) {
      return NextResponse.json({ error: 'Тариф недоступен' }, { status: 400 });
    }

    await getOrCreatePartnerProfile(userId);

    const result = await sequelize.transaction(async (transaction) => {
      const user = await User.findByPk(userId, {
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });
      if (!user) {
        throw Object.assign(new Error('Пользователь не найден'), { status: 404 });
      }

      const { profile } = await applyBalanceChange({
        partnerUserId: userId,
        type: 'plan_purchase',
        amountRub: -planConfig.priceRub!,
        meta: { planCode, priceRub: planConfig.priceRub },
        transaction,
      });

      const { assignedAt, expiresAt } = assignPlanDates(planCode);
      (user as any).planCode = planCode;
      (user as any).planAssignedAt = assignedAt;
      (user as any).planExpiresAt = expiresAt;
      (user as any).planManuallyAssignedAt = null;
      resetPlanDailyUsage(user);
      await user.save({ transaction });

      return {
        balanceRub: parseMoney(profile.balanceRub),
        plan: getUserPlanSnapshot(user),
      };
    });

    try {
      await enrollUserOnPlanPurchase(userId, planCode);
    } catch (enrollError) {
      console.error('Partner plan purchase enroll failed', { userId, planCode, enrollError });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('partner pay error:', error);
    const message = String(error?.message || '');
    if (message.includes('Insufficient partner balance')) {
      return NextResponse.json({ error: 'Недостаточно средств на балансе партнерки' }, { status: 400 });
    }
    return NextResponse.json(
      { error: error?.status === 404 ? 'Пользователь не найден' : 'Ошибка оплаты с баланса' },
      { status: error?.status || 500 }
    );
  }
}
