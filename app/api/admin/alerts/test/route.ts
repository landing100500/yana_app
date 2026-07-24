import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { alertAdmin, getAdminAlertsEmail, type AlertSeverity } from '@/lib/admin-alerts';
import { isSmtpConfigured } from '@/lib/email-transport';

export const dynamic = 'force-dynamic';

const ALLOWED: AlertSeverity[] = ['critical', 'high', 'medium', 'low'];

export async function POST(request: NextRequest) {
  try {
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const severity = (body.severity || 'high') as AlertSeverity;
    const title = String(body.title || `Тест ${severity}`).slice(0, 200);

    if (!ALLOWED.includes(severity)) {
      return NextResponse.json({ error: 'severity: critical|high|medium|low' }, { status: 400 });
    }

    const email = getAdminAlertsEmail();
    if (!email) {
      return NextResponse.json(
        { error: 'ADMIN_ALERTS_EMAIL не задан в env' },
        { status: 500 }
      );
    }
    if (!isSmtpConfigured()) {
      return NextResponse.json({ error: 'SMTP не настроен' }, { status: 500 });
    }

    const ok = await alertAdmin({
      source: 'admin/alerts-test',
      severity,
      title,
      detail: 'Тестовое оповещение из админки',
      meta: { via: 'POST /api/admin/alerts/test' },
      dedupeMs: 0,
    });

    return NextResponse.json({ ok, email, severity });
  } catch (error) {
    console.error('Admin alerts test error:', error);
    return NextResponse.json({ error: 'Test failed' }, { status: 500 });
  }
}
