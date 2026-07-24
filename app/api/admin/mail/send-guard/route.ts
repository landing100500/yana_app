import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import {
  getMarketingSendBudget,
  pauseMarketingMail,
  resumeMarketingMail,
} from '@/lib/mail-send-guard';
import { getSmtpConfig, isSmtpConfigured } from '@/lib/email-transport';
import { mailQueueConfig } from '@/lib/mail-queue-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const budget = await getMarketingSendBudget();
    let transactionalFrom: string | null = null;
    let marketingFrom: string | null = null;
    try {
      transactionalFrom = getSmtpConfig('transactional').from;
    } catch {
      /* */
    }
    try {
      marketingFrom = getSmtpConfig('marketing').from;
    } catch {
      /* */
    }

    return NextResponse.json({
      ...budget,
      queue: mailQueueConfig,
      smtp: {
        transactionalConfigured: isSmtpConfigured('transactional'),
        marketingConfigured: isSmtpConfigured('marketing'),
        transactionalFrom,
        marketingFrom,
        sameMailbox: Boolean(transactionalFrom && marketingFrom && transactionalFrom === marketingFrom),
      },
    });
  } catch (error) {
    console.error('mail send-guard GET:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const body = (await request.json().catch(() => ({}))) as {
      action?: 'pause' | 'resume';
      reason?: string;
    };

    if (body.action === 'pause') {
      await pauseMarketingMail(body.reason || 'Пауза вручную из админки');
    } else if (body.action === 'resume') {
      await resumeMarketingMail();
    } else {
      return NextResponse.json({ error: 'action: pause|resume' }, { status: 400 });
    }

    const budget = await getMarketingSendBudget();
    return NextResponse.json({ success: true, ...budget });
  } catch (error) {
    console.error('mail send-guard POST:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
