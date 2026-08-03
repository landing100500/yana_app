import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import {
  REFERRAL_COOKIE_MAX_AGE_SEC,
  REFERRAL_COOKIE_NAME,
  findPartnerByReferralCode,
} from '@/lib/partner';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const body = await request.json().catch(() => ({}));
    const code = String(body?.code || body?.ref || '').trim().toUpperCase();
    if (!code || code.length < 4 || code.length > 32) {
      return NextResponse.json({ error: 'Некорректный реферальный код' }, { status: 400 });
    }

    const partner = await findPartnerByReferralCode(code);
    if (!partner) {
      return NextResponse.json({ error: 'Реферальный код не найден' }, { status: 404 });
    }

    const response = NextResponse.json({
      success: true,
      code: partner.referralCode,
    });
    response.cookies.set(REFERRAL_COOKIE_NAME, partner.referralCode, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: REFERRAL_COOKIE_MAX_AGE_SEC,
      path: '/',
    });
    return response;
  } catch (error) {
    console.error('partner capture-ref error:', error);
    return NextResponse.json({ error: 'Ошибка сохранения реферального кода' }, { status: 500 });
  }
}
