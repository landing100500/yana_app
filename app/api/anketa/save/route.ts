import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import UserAnketa from '@/models/UserAnketa';
import { initDatabase } from '@/lib/initDb';

const JWT_SECRET = process.env.JWT_SECRET || 'yasna-secret-key-change-in-production';

async function getUserId(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    return decoded.userId;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      );
    }

    const data = await request.json();

    // Находим или создаем анкету
    let anketa = await UserAnketa.findOne({ where: { userId } });

    if (!anketa) {
      anketa = await UserAnketa.create({
        userId,
        ...data,
      });
    } else {
      await anketa.update(data);
    }

    return NextResponse.json({
      success: true,
      message: 'Анкета успешно сохранена',
    });
  } catch (error: any) {
    console.error('Save anketa error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка при сохранении анкеты' },
      { status: 500 }
    );
  }
}
