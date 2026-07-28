import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { processMailQueue } from '@/lib/mail-marketing';
import { mailQueueConfig } from '@/lib/mail-queue-config';
import { alertAdminAsync } from '@/lib/admin-alerts';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const provided = authHeader?.replace(/^Bearer\s+/i, '') || request.nextUrl.searchParams.get('secret');

  if (!secret) {
    alertAdminAsync({
      source: 'cron/mail-queue',
      severity: 'high',
      title: 'CRON_SECRET не задан',
      detail: 'Cron mail-queue не может авторизоваться',
      dedupeMs: 60 * 60 * 1000,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await initDatabase();
    const limit = Number(request.nextUrl.searchParams.get('limit') || mailQueueConfig.queueLimit);
    const result = await processMailQueue(limit);
    if (result.blockedReason) {
      const reason = result.blockedReason;
      const isExpectedPause =
        reason.includes('Дневной лимит') ||
        reason.includes('Часовой лимит') ||
        reason.includes('Пауза вручную') ||
        reason.includes('Unisender Go') ||
        reason.includes('приостановлена') ||
        reason.includes('бан SMTP');
      // Ожидаемая пауза/кап — не спамим почту; админ и так видит баннер
      if (!isExpectedPause) {
        alertAdminAsync({
          source: 'cron/mail-queue',
          severity: 'high',
          title: 'Cron mail-queue: маркетинг заблокирован',
          detail: reason,
          dedupeMs: 60 * 60 * 1000,
        });
      }
    } else if (result.sendsFailed > 0 && result.sendsSent === 0) {
      alertAdminAsync({
        source: 'cron/mail-queue',
        severity: 'high',
        title: 'Cron mail-queue: все отправки в батче упали',
        detail: `failed=${result.sendsFailed}, sent=0`,
        meta: result as unknown as Record<string, number>,
        dedupeMs: 10 * 60 * 1000,
      });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Mail queue cron error:', error);
    alertAdminAsync({
      source: 'cron/mail-queue',
      severity: 'critical',
      title: 'Cron mail-queue: падение',
      error,
    });
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
