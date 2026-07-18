import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initDatabase } from '@/lib/initDb';
import User from '@/models/User';
import { assignPlanDates, getUserPlanSnapshot, parsePlanCode, resetPlanDailyUsage } from '@/lib/subscription';
import { enrollUserOnPlanPurchase } from '@/lib/mail-marketing';

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
    const planCode = parsePlanCode(body?.planCode);
    if (!planCode) {
      return NextResponse.json({ error: 'Неверный тариф' }, { status: 400 });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    const { assignedAt, expiresAt } = assignPlanDates(planCode);
    (user as any).planCode = planCode;
    (user as any).planAssignedAt = assignedAt;
    (user as any).planExpiresAt = expiresAt;
    if (planCode === 'free') {
      (user as any).freeAiRequestsUsed = 0;
    } else {
      (user as any).planManuallyAssignedAt = new Date();
    }
    resetPlanDailyUsage(user);
    await user.save();

    // Ручная выдача платного тарифа админом — тот же триггер, что и покупка
    if (planCode !== 'free') {
      try {
        await enrollUserOnPlanPurchase(user.id, planCode);
      } catch (enrollError) {
        console.error('Admin plan sequence enroll failed', { userId: user.id, planCode, enrollError });
      }
    }

    return NextResponse.json({
      success: true,
      plan: getUserPlanSnapshot(user),
    });
  } catch (error: any) {
    console.error('Admin update plan error:', error);
    return NextResponse.json({ error: 'Ошибка при обновлении тарифа' }, { status: 500 });
  }
}
