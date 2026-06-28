import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { processMailQueue } from '@/lib/mail-marketing';

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
    const limit = Number(request.nextUrl.searchParams.get('limit') || 30);
    const result = await processMailQueue(limit);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Mail queue cron error:', error);
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
