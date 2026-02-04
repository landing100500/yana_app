import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initDatabase } from '@/lib/initDb';
import NatalChart from '@/models/NatalChart';
import User from '@/models/User';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    await initDatabase();
    
    if (!(await checkAdminAuth())) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      );
    }

    const userId = parseInt(params.userId);
    if (isNaN(userId)) {
      return NextResponse.json(
        { error: 'Неверный ID пользователя' },
        { status: 400 }
      );
    }

    // Проверяем существование пользователя
    const user = await User.findByPk(userId);
    if (!user) {
      return NextResponse.json(
        { error: 'Пользователь не найден' },
        { status: 404 }
      );
    }

    // Получаем все карты пользователя
    const charts = await NatalChart.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });

    const chartsData = charts.map((chart: any) => ({
      id: chart.id,
      name: chart.name,
      chartDate: chart.chartDate,
      chartTime: chart.chartTime,
      chartCity: chart.chartCity,
      createdAt: chart.createdAt,
    }));

    return NextResponse.json({ 
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name || user.phone,
      },
      charts: chartsData 
    });
  } catch (error: any) {
    console.error('Error fetching user charts:', error);
    return NextResponse.json(
      { error: 'Ошибка при получении карт пользователя' },
      { status: 500 }
    );
  }
}
