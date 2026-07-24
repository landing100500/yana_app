import { NextRequest, NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { initDatabase } from '@/lib/initDb';
import Payment from '@/models/Payment';
import { syncPaymentWithYookassa } from '@/lib/payments';
import { alertAdminAsync } from '@/lib/admin-alerts';

export const dynamic = 'force-dynamic';

const RECONCILE_DAYS = 14;
const BATCH_SIZE = 50;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await initDatabase();

    const since = new Date(Date.now() - RECONCILE_DAYS * 24 * 60 * 60 * 1000);
    const pendingPayments = await Payment.findAll({
      where: {
        status: 'pending',
        yookassaPaymentId: { [Op.ne]: null },
        createdAt: { [Op.gt]: since },
      },
      order: [['id', 'ASC']],
      limit: BATCH_SIZE,
    });

    let activated = 0;
    let canceled = 0;
    let stillPending = 0;
    let failed = 0;

    for (const payment of pendingPayments) {
      try {
        const before = payment.status;
        const synced = await syncPaymentWithYookassa(payment);
        if (synced.status === 'succeeded' && before !== 'succeeded') {
          activated += 1;
        } else if (synced.status === 'canceled') {
          canceled += 1;
        } else {
          stillPending += 1;
        }
      } catch (error) {
        failed += 1;
        console.error('Cron reconcile payment failed', payment.id, error);
      }
    }

    return NextResponse.json({
      checked: pendingPayments.length,
      activated,
      canceled,
      stillPending,
      failed,
    });
  } catch (error: any) {
    console.error('Cron reconcile error:', error);
    alertAdminAsync({
      source: 'cron/reconcile-payments',
      severity: 'critical',
      title: 'Cron reconcile-payments: падение',
      error,
    });
    return NextResponse.json({ error: error?.message || 'Reconcile failed' }, { status: 500 });
  }
}
