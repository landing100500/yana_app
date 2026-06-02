import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Op } from 'sequelize';
import { initDatabase } from '@/lib/initDb';
import Payment from '@/models/Payment';
import User from '@/models/User';
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
      include: [
        {
          model: User,
          attributes: ['id', 'name', 'email', 'phone'],
          required: false,
        },
      ],
      order: [['paidAt', 'DESC']],
    });

    const rows = payments.map((payment: any) => {
      const amount = Number(payment.amountValue);
      const safeAmount = Number.isFinite(amount) ? amount : 0;
      const user = payment.User;
      return {
        id: payment.id,
        paidAt: payment.paidAt,
        amountValue: payment.amountValue,
        amountRub: safeAmount,
        currency: payment.currency,
        planCode: payment.planCode,
        planTitle: getPlanTitle(payment.planCode),
        description: `Оплата тарифа "${getPlanTitle(payment.planCode)}"`,
        yookassaPaymentId: payment.yookassaPaymentId,
        user: {
          id: user?.id ?? null,
          name: user?.name ?? null,
          email: user?.email ?? null,
          phone: user?.phone ?? null,
        },
      };
    });

    const totalAmountRub = rows.reduce((sum, row) => sum + row.amountRub, 0);

    return NextResponse.json({
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      totalAmountRub,
      totalPayments: rows.length,
      rows,
    });
  } catch (error) {
    console.error('Admin payments stats error:', error);
    return NextResponse.json({ error: 'Ошибка при загрузке статистики платежей' }, { status: 500 });
  }
}
