import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Op } from 'sequelize';
import { initDatabase } from '@/lib/initDb';
import Payment from '@/models/Payment';
import User from '@/models/User';
import { findManualAssignmentUsersInPeriod } from '@/lib/plan-manual-stats';
import { formatRubAmount } from '@/lib/yookassa';
import { PLAN_CONFIGS, PlanCode } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

type Period = 'week' | 'month' | 'custom';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildPeriodDates(period: Period, fromRaw: string | null, toRaw: string | null) {
  const now = new Date();
  const to = endOfDay(parseDate(toRaw) ?? now);

  if (period === 'custom') {
    const fromParsed = parseDate(fromRaw);
    const from = fromParsed ? startOfDay(fromParsed) : startOfDay(now);
    return { from, to };
  }

  if (period === 'month') {
    const from = startOfDay(new Date(to));
    from.setDate(from.getDate() - 29);
    return { from, to };
  }

  const from = startOfDay(new Date(to));
  from.setDate(from.getDate() - 6);
  return { from, to };
}

function getPlanTitle(planCode: string) {
  const key = planCode as PlanCode;
  return PLAN_CONFIGS[key]?.title || planCode;
}

function getPlanPriceRub(planCode: string): number {
  const key = planCode as PlanCode;
  return PLAN_CONFIGS[key]?.priceRub ?? 0;
}

export async function GET(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const period = (searchParams.get('period') || 'week') as Period;
    if (!['week', 'month', 'custom'].includes(period)) {
      return NextResponse.json({ error: 'Неверный тип периода' }, { status: 400 });
    }

    const fromRaw = searchParams.get('from');
    const toRaw = searchParams.get('to');
    const { from, to } = buildPeriodDates(period, fromRaw, toRaw);

    if (from.getTime() > to.getTime()) {
      return NextResponse.json({ error: 'Дата начала больше даты окончания' }, { status: 400 });
    }

    const payments = await Payment.findAll({
      where: {
        status: 'succeeded',
        paidAt: {
          [Op.between]: [from, to],
        },
      },
      order: [['paidAt', 'DESC']],
    });

    const manualUsers = await findManualAssignmentUsersInPeriod(from, to);

    const userIds = Array.from(
      new Set(
        [
          ...payments.map((payment: any) => Number(payment.userId)),
          ...manualUsers.map((user: any) => Number(user.id)),
        ].filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    const users = userIds.length
      ? await User.findAll({
          where: { id: userIds },
          attributes: ['id', 'name', 'email', 'phone'],
          raw: true,
        })
      : [];

    const userById = new Map<number, any>();
    for (const user of users as any[]) {
      userById.set(Number(user.id), user);
    }

    const paymentRows = payments.map((payment: any) => {
      const amount = Number(payment.amountValue);
      const safeAmount = Number.isFinite(amount) ? amount : 0;
      const user = userById.get(Number(payment.userId)) || null;
      return {
        id: payment.id,
        paidAt: payment.paidAt,
        amountValue: payment.amountValue,
        amountRub: safeAmount,
        currency: payment.currency,
        planCode: payment.planCode,
        planTitle: getPlanTitle(payment.planCode),
        description: `Оплата тарифа «${getPlanTitle(payment.planCode)}»`,
        isManual: false,
        yookassaPaymentId: payment.yookassaPaymentId,
        user: {
          id: user?.id ?? null,
          name: user?.name ?? null,
          email: user?.email ?? null,
          phone: user?.phone ?? null,
        },
      };
    });

    const manualRows = (manualUsers as any[]).map((manualUser) => {
      const user = userById.get(Number(manualUser.id)) || manualUser;
      const planCode = String(manualUser.planCode || '');
      const planTitle = getPlanTitle(planCode);
      const amountRub = getPlanPriceRub(planCode);
      return {
        id: -Number(manualUser.id),
        paidAt: manualUser.manualEventAt,
        amountValue: formatRubAmount(amountRub),
        amountRub,
        currency: 'RUB',
        planCode,
        planTitle,
        description: `Тариф «${planTitle}» — добавлен вручную`,
        isManual: true,
        yookassaPaymentId: null,
        user: {
          id: user?.id ?? null,
          name: user?.name ?? null,
          email: user?.email ?? null,
          phone: user?.phone ?? null,
        },
      };
    });

    const rows = [...paymentRows, ...manualRows].sort((a, b) => {
      const aTime = new Date(a.paidAt).getTime();
      const bTime = new Date(b.paidAt).getTime();
      return bTime - aTime;
    });

    const totalAmountRub = [...paymentRows, ...manualRows].reduce((sum, row) => sum + row.amountRub, 0);

    return NextResponse.json({
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      totalAmountRub,
      totalPayments: paymentRows.length,
      totalManualAssignments: manualRows.length,
      rows,
    });
  } catch (error: any) {
    console.error('Admin payments stats error:', error);
    const message = error?.message ? `: ${error.message}` : '';
    return NextResponse.json({ error: `Ошибка при загрузке статистики платежей${message}` }, { status: 500 });
  }
}
