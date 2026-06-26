import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { initDatabase } from '@/lib/initDb';
import { ensureSessionForToken } from '@/lib/auth-session';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'yasna-secret-key-change-in-production';

export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: 'Token required' },
        { status: 400 }
      );
    }

    let decoded: { userId: number };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    } catch {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    await ensureSessionForToken(decoded.userId, token);

    const cookieStore = await cookies();
    const response = NextResponse.json({ success: true });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    cookieStore.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Set token error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка' },
      { status: 500 }
    );
  }
}
