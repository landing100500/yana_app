import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import Payment from '@/models/Payment';
import { syncPaymentWithYookassa } from '@/lib/payments';

export const dynamic = 'force-dynamic';

interface YookassaWebhookBody {
  type?: string;
  event?: string;
  object?: {
    id?: string;
    status?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const body = (await request.json().catch(() => ({}))) as YookassaWebhookBody;
    const event = body.event;
    const yookassaPaymentId = body.object?.id;

    if (!yookassaPaymentId) {
      return NextResponse.json({ received: true });
    }

    if (event !== 'payment.succeeded' && event !== 'payment.canceled' && event !== 'payment.waiting_for_capture') {
      return NextResponse.json({ received: true });
    }

    const payment = await Payment.findOne({ where: { yookassaPaymentId } });
    if (!payment) {
      console.warn('YooKassa webhook: payment not found', yookassaPaymentId);
      return NextResponse.json({ received: true });
    }

    await syncPaymentWithYookassa(payment);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('YooKassa webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
