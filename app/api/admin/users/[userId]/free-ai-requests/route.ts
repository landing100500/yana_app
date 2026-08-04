import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { grantFreeAiRequestsToUser } from '@/lib/admin-users';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { userId: rawId } = await context.params;
    const userId = Number(rawId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Некорректный userId' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const add = Number(body.add);
    if (!Number.isFinite(add) || add <= 0) {
      return NextResponse.json({ error: 'Укажите add: целое число > 0' }, { status: 400 });
    }

    try {
      const result = await grantFreeAiRequestsToUser(userId, add);
      return NextResponse.json({ success: true, ...result });
    } catch (e) {
      if (e instanceof Error && e.message === 'USER_NOT_FOUND') {
        return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
      }
      if (e instanceof Error && e.message === 'INVALID_ADD') {
        return NextResponse.json({ error: 'Укажите add: целое число > 0' }, { status: 400 });
      }
      throw e;
    }
  } catch (error) {
    console.error('admin free-ai-requests PATCH:', error);
    return NextResponse.json({ error: 'Ошибка выдачи запросов' }, { status: 500 });
  }
}
