import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { getAuthenticatedUserId } from '@/lib/auth-user';
import Payment from '@/models/Payment';
import User from '@/models/User';
import { getPaymentStatusPayload } from '@/lib/payments';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await initDatabase();

    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const paymentId = Number(request.nextUrl.searchParams.get('id'));
    if (!Number.isFinite(paymentId) || paymentId <= 0) {
      return NextResponse.json({ error: 'Неверный ID платежа' }, { status: 400 });
    }

    const payment = await Payment.findByPk(paymentId);
    if (!payment || payment.userId !== userId) {
      return NextResponse.json({ error: 'Платеж не найден' }, { status: 404 });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    const payload = await getPaymentStatusPayload(payment, user);
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('Payment status error:', error);
    return NextResponse.json(
      { error: error?.message || 'Ошибка при проверке платежа' },
      { status: 500 }
    );
  }
}
