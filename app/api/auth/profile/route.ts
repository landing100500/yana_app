import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import User from '@/models/User';
import { initDatabase } from '@/lib/initDb';
import { ensureSessionForToken } from '@/lib/auth-session';
import { reconcileUserPendingPayments } from '@/lib/payments';
import { ensureFreePlanWindow, getUserPlanSnapshot, syncPlanDailyUsage } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

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

      await ensureSessionForToken(decoded.userId, token);

      const user = await User.findByPk(decoded.userId);

      if (!user) {
        return NextResponse.json(
          { error: 'Пользователь не найден' },
          { status: 404 }
        );
      }

      await reconcileUserPendingPayments(decoded.userId);
      await user.reload();

      await ensureFreePlanWindow(user);
      await syncPlanDailyUsage(user);
      const plan = getUserPlanSnapshot(user);
      return NextResponse.json({
        email: user.email || null,
        name: user.name || null,
        plan,
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

