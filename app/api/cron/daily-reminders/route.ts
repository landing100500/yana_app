import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { runDailyReminders } from '@/lib/daily-reminders';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const provided = authHeader?.replace(/^Bearer\s+/i, '') || request.nextUrl.searchParams.get('secret');

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await initDatabase();
    const result = await runDailyReminders();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Daily reminders cron error:', error);
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
