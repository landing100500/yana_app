import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initDatabase } from '@/lib/initDb';
import User from '@/models/User';
import { assignPlanDates, getUserPlanSnapshot, PlanCode } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const userId = Number(params.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Неверный ID пользователя' }, { status: 400 });
    }

    const body = await request.json();
    const requestedCode = String(body?.planCode || '').toLowerCase();
    if (!['free', 'hours24', 'optimal', 'professional'].includes(requestedCode)) {
      return NextResponse.json({ error: 'Неверный тариф' }, { status: 400 });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    const planCode = requestedCode as PlanCode;
    const { assignedAt, expiresAt } = assignPlanDates(planCode);
    (user as any).planCode = planCode;
    (user as any).planAssignedAt = assignedAt;
    (user as any).planExpiresAt = expiresAt;
    if (planCode === 'free') {
      (user as any).freeWindowStartedAt = new Date();
      (user as any).freeMinutesUsed = 0;
    } else {
      (user as any).planManuallyAssignedAt = new Date();
      (user as any).freeWindowStartedAt = null;
    }
    await user.save();

    return NextResponse.json({
      success: true,
      plan: getUserPlanSnapshot(user),
    });
  } catch (error: any) {
    console.error('Admin update plan error:', error);
    return NextResponse.json({ error: 'Ошибка при обновлении тарифа' }, { status: 500 });
  }
}
