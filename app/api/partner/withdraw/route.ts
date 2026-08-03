import { NextRequest, NextResponse } from 'next/server';
import sequelize from '@/lib/db';
import { Transaction } from 'sequelize';
import { initDatabase } from '@/lib/initDb';
import { getAuthenticatedUserId } from '@/lib/auth-user';
import {
  applyBalanceChange,
  formatMoney,
  getOrCreatePartnerProfile,
  getPartnerSettings,
  parseMoney,
  roundMoney,
} from '@/lib/partner';
import PartnerProfile from '@/models/PartnerProfile';
import PartnerWithdrawal, { PartnerWithdrawalMethod } from '@/models/PartnerWithdrawal';

export const dynamic = 'force-dynamic';

function parseMethod(raw: unknown): PartnerWithdrawalMethod | null {
  if (raw === 'card' || raw === 'sbp') return raw;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const method = parseMethod(body?.method);
    const requisites = String(body?.requisites || '').trim();
    const amountRub = roundMoney(Number(body?.amountRub));

    if (!method) {
      return NextResponse.json({ error: 'Способ вывода: card или sbp' }, { status: 400 });
    }
    if (!requisites || requisites.length < 5) {
      return NextResponse.json({ error: 'Укажите реквизиты для вывода' }, { status: 400 });
    }
    if (!Number.isFinite(amountRub) || amountRub <= 0) {
      return NextResponse.json({ error: 'Некорректная сумма' }, { status: 400 });
    }

    const profile = await getOrCreatePartnerProfile(userId);
    if (profile.verificationStatus !== 'approved') {
      return NextResponse.json(
        { error: 'Для вывода нужно пройти верификацию (паспорт и ИНН)' },
        { status: 403 }
      );
    }

    const settings = await getPartnerSettings();
    if (amountRub < settings.minWithdrawalRub) {
      return NextResponse.json(
        { error: `Минимальная сумма вывода — ${settings.minWithdrawalRub} ₽` },
        { status: 400 }
      );
    }

    const ndflAmount = roundMoney((amountRub * settings.ndflPercent) / 100);
    const payoutAmount = roundMoney(amountRub - ndflAmount);

    const withdrawal = await sequelize.transaction(async (transaction) => {
      const locked = await PartnerProfile.findOne({
        where: { userId },
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });
      if (!locked) {
        throw new Error('Partner profile not found');
      }
      if (parseMoney(locked.balanceRub) < amountRub) {
        throw Object.assign(new Error('Insufficient partner balance'), { status: 400 });
      }

      const row = await PartnerWithdrawal.create(
        {
          partnerUserId: userId,
          amountRub: formatMoney(amountRub),
          ndflPercent: formatMoney(settings.ndflPercent),
          ndflAmount: formatMoney(ndflAmount),
          payoutAmount: formatMoney(payoutAmount),
          method,
          requisites,
          status: 'pending',
        },
        { transaction }
      );

      await applyBalanceChange({
        partnerUserId: userId,
        type: 'withdrawal',
        amountRub: -amountRub,
        withdrawalId: row.id,
        meta: { method, ndflPercent: settings.ndflPercent, payoutAmount },
        transaction,
      });

      return row;
    });

    return NextResponse.json({
      success: true,
      withdrawal: {
        id: withdrawal.id,
        amountRub,
        ndflAmount,
        payoutAmount,
        method,
        status: withdrawal.status,
      },
    });
  } catch (error: any) {
    console.error('partner withdraw error:', error);
    const message = String(error?.message || '');
    if (message.includes('Insufficient partner balance')) {
      return NextResponse.json({ error: 'Недостаточно средств на балансе' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Ошибка создания заявки на вывод' }, { status: 500 });
  }
}
