import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { fetchAdminUsersPage } from '@/lib/admin-users';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await initDatabase();

    if (!(await checkAdminAuth())) {
      return adminUnauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || undefined;
    const email = searchParams.get('email') || undefined;
    const planCode = searchParams.get('planCode') || undefined;
    const freeAiRemaining = searchParams.get('freeAiRemaining') || undefined;
    const registeredFrom = searchParams.get('registeredFrom') || undefined;
    const registeredTo = searchParams.get('registeredTo') || undefined;

    const result = await fetchAdminUsersPage({
      page: Number(page),
      limit: limit ? Number(limit) : undefined,
      email,
      planCode,
      freeAiRemaining,
      registeredFrom,
      registeredTo,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Ошибка при получении пользователей' }, { status: 500 });
  }
}
