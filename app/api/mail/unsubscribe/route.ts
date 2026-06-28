import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import {
  getSubscriberByToken,
  unsubscribeByToken,
  resubscribeByToken,
} from '@/lib/mail-marketing';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await initDatabase();
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }

    const subscriber = await getSubscriberByToken(token);
    if (!subscriber) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
    }

    return NextResponse.json({
      email: subscriber.email,
      isSubscribed: subscriber.isSubscribed,
    });
  } catch (error) {
    console.error('Unsubscribe GET error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const { token, action } = await request.json();
    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }

    if (action === 'resubscribe') {
      const ok = await resubscribeByToken(String(token));
      if (!ok) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
      return NextResponse.json({ success: true, isSubscribed: true });
    }

    const result = await unsubscribeByToken(String(token));
    if (!result.ok) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
    }

    return NextResponse.json({ success: true, email: result.email, isSubscribed: false });
  } catch (error) {
    console.error('Unsubscribe POST error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
