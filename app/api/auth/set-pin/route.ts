import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '@/models/User';
import Session from '@/models/Session';
import { initDatabase } from '@/lib/initDb';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'yasna-secret-key-change-in-production';

function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });
}

function isFourDigitPin(s: string): boolean {
  return /^\d{4}$/.test(s);
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const { pin, pinConfirm, pinSetupToken } = await request.json();

    if (!pinSetupToken || typeof pinSetupToken !== 'string') {
      return NextResponse.json({ error: 'Сессия установки кода истекла. Войдите по email снова.' }, { status: 401 });
    }

    let payload: { userId: number; email?: string; purpose?: string };
    try {
      payload = jwt.verify(pinSetupToken, JWT_SECRET) as { userId: number; email?: string; purpose?: string };
    } catch {
      return NextResponse.json({ error: 'Сессия установки кода истекла. Войдите по email снова.' }, { status: 401 });
    }

    if (payload.purpose !== 'pin_setup') {
      return NextResponse.json({ error: 'Недопустимый токен' }, { status: 400 });
    }

    if (!isFourDigitPin(String(pin)) || !isFourDigitPin(String(pinConfirm))) {
      return NextResponse.json({ error: 'Код должен состоять из 4 цифр' }, { status: 400 });
    }

    if (String(pin) !== String(pinConfirm)) {
      return NextResponse.json({ error: 'Коды не совпадают' }, { status: 400 });
    }

    const user = await User.findByPk(payload.userId);
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    if (user.password) {
      return NextResponse.json({ error: 'Код уже установлен. Войдите через «Вход по паролю».' }, { status: 409 });
    }

    const password = await bcrypt.hash(String(pin), 10);
    await user.update({ password });

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await Session.create({
      userId: user.id,
      token,
      expiresAt,
    });

    const response = NextResponse.json({
      success: true,
      token,
    });

    setAuthCookie(response, token);

    const cookieStore = await cookies();
    cookieStore.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error: unknown) {
    console.error('Set pin error:', error);
    return NextResponse.json({ error: 'Не удалось сохранить код' }, { status: 500 });
  }
}
