import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { isValidEmail, normalizeEmail } from '@/lib/email';
import { sendEmailOtp } from '@/lib/send-email-otp';
// import { normalizeRuPhoneDigits } from '@/lib/phone';
// import { sendPhoneSmsOtp } from '@/lib/send-phone-sms-otp';

export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const { email: rawEmail } = await request.json();

    if (!rawEmail) {
      return NextResponse.json({ error: 'Email обязателен' }, { status: 400 });
    }

    const email = normalizeEmail(rawEmail);
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Введите корректный email' }, { status: 400 });
    }

    const result = await sendEmailOtp(email, { requireExistingUser: true });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      message: 'Код отправлен на email',
    });
  } catch (error: unknown) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Произошла ошибка при обработке запроса' }, { status: 500 });
  }
}
