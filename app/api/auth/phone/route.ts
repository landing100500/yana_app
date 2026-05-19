import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { isValidEmail, normalizeEmail } from '@/lib/email';
import { sendEmailOtp } from '@/lib/send-email-otp';
import { normalizePhoneDigits, formatPhoneValidationError } from '@/lib/phone';
// import { sendPhoneSmsOtp } from '@/lib/send-phone-sms-otp';

export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const { email: rawEmail, phone: rawPhone } = await request.json();

    if (!rawEmail) {
      return NextResponse.json({ error: 'Email обязателен' }, { status: 400 });
    }

    const email = normalizeEmail(rawEmail);
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Введите корректный email' }, { status: 400 });
    }
    const phone = normalizePhoneDigits(String(rawPhone || ''));
    if (!phone) {
      return NextResponse.json({ error: formatPhoneValidationError() }, { status: 400 });
    }

    const result = await sendEmailOtp(email, { requireExistingUser: false });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      message: 'Код отправлен на email',
      phoneMaskedTail: `***${phone.slice(-4)}`,
    });
  } catch (error: unknown) {
    console.error('Phone auth error:', error);
    return NextResponse.json({ error: 'Произошла ошибка при обработке запроса' }, { status: 500 });
  }
}
