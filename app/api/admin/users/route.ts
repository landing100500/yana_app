import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initDatabase } from '@/lib/initDb';
import User from '@/models/User';
import NatalChart from '@/models/NatalChart';
import Session from '@/models/Session';
import { col, fn } from 'sequelize';
import { getUserPlanSnapshot } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

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
      attributes: ['id', 'phone', 'email', 'name', 'createdAt', 'planCode', 'planExpiresAt', 'freeAiRequestsUsed'],
      include: [
        {
          model: NatalChart,
          as: 'natalCharts',
          attributes: ['id'],
          required: false,
        },
      ],
    });

    const sessions = (await Session.findAll({
      attributes: ['userId', [fn('MAX', col('updatedAt')), 'lastVisitAt']],
      group: ['userId'],
      raw: true,
    }) as unknown) as Array<{ userId: number; lastVisitAt: string | null }>;

    const lastVisitByUserId = new Map<number, string>();
    for (const session of sessions) {
      if (session?.userId && session?.lastVisitAt) {
        lastVisitByUserId.set(session.userId, session.lastVisitAt);
      }
    }

    const usersWithChartCount = users.map((user: any) => {
      const plan = getUserPlanSnapshot(user);
      return {
      id: user.id,
      email: user.email || null,
      phone: user.phone,
      name: user.name || user.email || user.phone || `User #${user.id}`,
      tariff: plan.title,
      planCode: plan.code,
      planExpiresAt: plan.expiresAt,
      createdAt: user.createdAt,
      chartCount: user.natalCharts?.length || 0,
      lastVisitAt: lastVisitByUserId.get(user.id) || null,
      };
    });

    return NextResponse.json({ users: usersWithChartCount });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Ошибка при получении пользователей' },
      { status: 500 }
    );
  }
}
