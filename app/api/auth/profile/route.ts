import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import User from '@/models/User';
import Session from '@/models/Session';
import { initDatabase } from '@/lib/initDb';

const JWT_SECRET = process.env.JWT_SECRET || 'yasna-secret-key-change-in-production';

export async function GET(request: NextRequest) {
  try {
    await initDatabase();

    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      );
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };

      const session = await Session.findOne({
        where: {
          token,
          userId: decoded.userId,
          expiresAt: {
            [Op.gt]: new Date(),
          },
        },
      });

      if (!session) {
        return NextResponse.json(
          { error: 'Сессия не найдена' },
          { status: 401 }
        );
      }

      const user = await User.findByPk(decoded.userId);

      if (!user) {
        return NextResponse.json(
          { error: 'Пользователь не найден' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        phone: user.phone,
        name: user.name || null,
      });
    } catch (jwtError) {
      return NextResponse.json(
        { error: 'Неверный токен' },
        { status: 401 }
      );
    }
  } catch (error: any) {
    console.error('Profile error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка' },
      { status: 500 }
    );
  }
}

