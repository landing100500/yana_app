import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import Session from '@/models/Session';
import { initDatabase } from '@/lib/initDb';

const JWT_SECRET = process.env.JWT_SECRET || 'yasna-secret-key-change-in-production';

export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };

        // Удаляем сессию из базы данных
        await Session.destroy({
          where: {
            token,
            userId: decoded.userId,
          },
        });
      } catch (jwtError) {
        // Игнорируем ошибки JWT при выходе
      }
    }

    const response = NextResponse.json({ success: true });

    // Удаляем cookie
    response.cookies.set('auth_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    cookieStore.delete('auth_token');

    return response;
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка при выходе' },
      { status: 500 }
    );
  }
}

