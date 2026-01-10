import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import UserAnketa from '@/models/UserAnketa';
import { initDatabase } from '@/lib/initDb';

export const dynamic = 'force-dynamic';

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

export async function GET(request: NextRequest) {
  try {
    await initDatabase();

    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json(
        { filled: false, reason: 'not_authenticated' },
        { status: 401 }
      );
    }

    const anketa = await UserAnketa.findOne({ where: { userId } });

    if (!anketa) {
      return NextResponse.json({
        filled: false,
        reason: 'anketa_not_found',
      });
    }

    // Проверяем обязательные поля
    const requiredFields = ['gender', 'birthDate', 'birthCity', 'birthTime'];
    const isFilled = requiredFields.every(
      (field) => anketa[field as keyof typeof anketa] !== null && 
                 anketa[field as keyof typeof anketa] !== ''
    );

    return NextResponse.json({
      filled: isFilled,
      anketa: isFilled ? anketa : null,
    });
  } catch (error: any) {
    console.error('Check anketa error:', error);
    return NextResponse.json(
      { filled: false, error: 'Произошла ошибка при проверке анкеты' },
      { status: 500 }
    );
  }
}
