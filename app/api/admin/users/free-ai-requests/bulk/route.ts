import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import {
  createMailListFromAdminFilters,
  grantFreeAiRequestsToUsers,
  resolveAdminUserIds,
  type AdminUserFilters,
} from '@/lib/admin-users';

export const dynamic = 'force-dynamic';

function parseFilters(body: Record<string, unknown>): AdminUserFilters {
  const remainingRaw = body.freeAiRemaining;
  let freeAiRemaining: number | null = null;
  if (remainingRaw !== undefined && remainingRaw !== null && remainingRaw !== '' && remainingRaw !== 'all') {
    const n = Number(remainingRaw);
    if (Number.isFinite(n) && n >= 0) freeAiRemaining = Math.floor(n);
  }

  return {
    email: typeof body.email === 'string' ? body.email : undefined,
    planCode: typeof body.planCode === 'string' ? body.planCode : undefined,
    freeAiRemaining,
    registeredFrom: typeof body.registeredFrom === 'string' ? body.registeredFrom : undefined,
    registeredTo: typeof body.registeredTo === 'string' ? body.registeredTo : undefined,
  };
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || '');
    const filters = parseFilters(body);

    if (action === 'grant') {
      const add = Number(body.add);
      if (!Number.isFinite(add) || add <= 0) {
        return NextResponse.json({ error: 'Укажите add: целое число > 0' }, { status: 400 });
      }

      const userIds = await resolveAdminUserIds(filters);
      if (userIds.length === 0) {
        return NextResponse.json({ success: true, matched: 0, updated: 0 });
      }
      const { updated } = await grantFreeAiRequestsToUsers(userIds, add);
      return NextResponse.json({ success: true, matched: userIds.length, updated, add: Math.floor(add) });
    }

    if (action === 'createMailList') {
      const name = String(body.listName || '').trim();
      if (!name) {
        return NextResponse.json({ error: 'Укажите listName' }, { status: 400 });
      }
      try {
        const result = await createMailListFromAdminFilters({
          name,
          description:
            typeof body.listDescription === 'string' ? body.listDescription : undefined,
          filters,
        });
        return NextResponse.json({ success: true, ...result });
      } catch (e) {
        if (e instanceof Error && e.message === 'EMPTY_NAME') {
          return NextResponse.json({ error: 'Укажите listName' }, { status: 400 });
        }
        throw e;
      }
    }

    return NextResponse.json(
      { error: 'action должен быть grant или createMailList' },
      { status: 400 }
    );
  } catch (error) {
    console.error('admin free-ai-requests bulk:', error);
    return NextResponse.json({ error: 'Ошибка массовой операции' }, { status: 500 });
  }
}
