import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { initDatabase } from '@/lib/initDb';
import NatalChart from '@/models/NatalChart';

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initDatabase();

    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      );
    }

    const chartId = parseInt(params.id);
    if (isNaN(chartId)) {
      return NextResponse.json(
        { error: 'Неверный ID карты' },
        { status: 400 }
      );
    }

    // Проверяем, что карта принадлежит пользователю
    const chart = await NatalChart.findOne({
      where: { id: chartId, userId }
    });

    if (!chart) {
      return NextResponse.json(
        { error: 'Карта не найдена' },
        { status: 404 }
      );
    }

    // Удаляем карту (все связанные записи удалятся автоматически благодаря CASCADE)
    await chart.destroy();

    return NextResponse.json({
      success: true,
      message: 'Карта успешно удалена'
    });
  } catch (error: any) {
    console.error('Delete natal chart error:', error);
    return NextResponse.json(
      { error: error.message || 'Ошибка при удалении натальной карты' },
      { status: 500 }
    );
  }
}
