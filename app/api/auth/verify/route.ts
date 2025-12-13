import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import sequelize from '@/lib/db';
import User from '@/models/User';
import Session from '@/models/Session';
import { initDatabase } from '@/lib/initDb';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'yasna-secret-key-change-in-production';

export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const { code, phone } = await request.json();

    if (!code || code.length !== 4) {
      return NextResponse.json(
        { error: 'Введите код' },
        { status: 400 }
      );
    }

    if (!phone) {
      return NextResponse.json(
        { error: 'Номер телефона не найден' },
        { status: 400 }
      );
    }

    let user = await User.findOne({ where: { phone } });

    if (!user) {
      user = await User.create({ phone });
    }

    const token = jwt.sign(
      { userId: user.id, phone: user.phone },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await Session.create({
      userId: user.id,
      token,
      expiresAt,
    });

    const cookieStore = await cookies();
    cookieStore.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    const response = NextResponse.json({
      success: true,
      token,
    });

    // Также устанавливаем cookie в response headers
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Verify error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка при проверке кода' },
      { status: 500 }
    );
  }
}

