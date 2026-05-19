import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { initDatabase } from '@/lib/initDb';
import { getAuthenticatedUserId } from '@/lib/auth-user';
import { getAppBaseUrl } from '@/lib/app-url';
import { createYookassaPayment, formatRubAmount } from '@/lib/yookassa';
import { buildSubscriptionReceipt } from '@/lib/yookassa-receipt';
import { getPlanConfig, PlanCode } from '@/lib/subscription';
import Payment from '@/models/Payment';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

const PAID_PLANS: PlanCode[] = ['optimal', 'professional'];

export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const planCode = String(body?.planCode || '').toLowerCase() as PlanCode;
    if (!PAID_PLANS.includes(planCode)) {
      return NextResponse.json({ error: 'Неверный тариф для оплаты' }, { status: 400 });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    const planConfig = getPlanConfig(planCode);
    if (!planConfig.priceRub) {
      return NextResponse.json({ error: 'Тариф недоступен для оплаты' }, { status: 400 });
    }

    const idempotenceKey = randomUUID();
    const amountValue = formatRubAmount(planConfig.priceRub);

    const payment = await Payment.create({
      userId,
      planCode,
      amountValue,
      currency: 'RUB',
      status: 'pending',
      idempotenceKey,
    });

    const returnUrl = `${getAppBaseUrl()}/tariffs?payment=${payment.id}`;

    let receipt;
    try {
      receipt = buildSubscriptionReceipt({
        planTitle: planConfig.title,
        amountRub: planConfig.priceRub,
        customer: {
          email: user.email || undefined,
          phone: user.phone || undefined,
          full_name: user.name || undefined,
        },
      });
    } catch (receiptError: any) {
      return NextResponse.json(
        { error: receiptError?.message || 'Не удалось сформировать чек для оплаты' },
        { status: 400 }
      );
    }

    const yookassaPayment = await createYookassaPayment(
      {
        amount: {
          value: amountValue,
          currency: 'RUB',
        },
        capture: true,
        confirmation: {
          type: 'redirect',
          return_url: returnUrl,
        },
        description: `Тариф «${planConfig.title}»`,
        metadata: {
          user_id: String(userId),
          plan_code: planCode,
          payment_id: String(payment.id),
        },
        receipt,
      },
      idempotenceKey
    );

    payment.yookassaPaymentId = yookassaPayment.id;
    await payment.save();

    const confirmationUrl = yookassaPayment.confirmation?.confirmation_url;
    if (!confirmationUrl) {
      return NextResponse.json({ error: 'Не удалось получить ссылку на оплату' }, { status: 502 });
    }

    return NextResponse.json({
      paymentId: payment.id,
      confirmationUrl,
    });
  } catch (error: any) {
    console.error('Create payment error:', error);
    return NextResponse.json(
      { error: error?.message || 'Ошибка при создании платежа' },
      { status: 500 }
    );
  }
}
