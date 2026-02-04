import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initDatabase } from '@/lib/initDb';
import User from '@/models/User';
import NatalChart from '@/models/NatalChart';
import { Op } from 'sequelize';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

export async function GET() {
  try {
    await initDatabase();
    
    if (!(await checkAdminAuth())) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      );
    }

    // Получаем всех пользователей с количеством карт
    const users = await User.findAll({
      attributes: ['id', 'phone', 'name', 'createdAt'],
      include: [
        {
          model: NatalChart,
          as: 'natalCharts',
          attributes: ['id'],
          required: false,
        },
      ],
    });

    const usersWithChartCount = users.map((user: any) => ({
      id: user.id,
      phone: user.phone,
      name: user.name || user.phone,
      createdAt: user.createdAt,
      chartCount: user.natalCharts?.length || 0,
    }));

    return NextResponse.json({ users: usersWithChartCount });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Ошибка при получении пользователей' },
      { status: 500 }
    );
  }
}
