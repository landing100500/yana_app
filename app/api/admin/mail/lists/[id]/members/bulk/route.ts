import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import MailList from '@/models/MailList';
import {
  resolveUserIdsFromBulkCriteria,
  addUsersToList,
  type BulkAddToListCriteria,
} from '@/lib/mail-list-users';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const list = await MailList.findByPk(Number(id));
    if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 });

    const body = await request.json();
    const criteria: BulkAddToListCriteria = {
      userIds: body.userIds,
      fromListId: body.fromListId ? Number(body.fromListId) : undefined,
      planCode: body.planCode || undefined,
      registeredFrom: body.registeredFrom || undefined,
      registeredTo: body.registeredTo || undefined,
      emailPrefix: body.emailPrefix || undefined,
      freeAiRemaining:
        body.freeAiRemaining !== undefined && body.freeAiRemaining !== null && body.freeAiRemaining !== ''
          ? Number(body.freeAiRemaining)
          : undefined,
    };

    const hasCriteria =
      (criteria.userIds && criteria.userIds.length > 0) ||
      criteria.fromListId ||
      criteria.planCode ||
      criteria.emailPrefix ||
      criteria.registeredFrom ||
      criteria.registeredTo ||
      (criteria.freeAiRemaining != null && Number.isFinite(criteria.freeAiRemaining));

    if (!hasCriteria) {
      return NextResponse.json({ error: 'Укажите критерии добавления' }, { status: 400 });
    }

    const userIds = await resolveUserIdsFromBulkCriteria(criteria);
    if (userIds.length === 0) {
      return NextResponse.json({ success: true, added: 0, matched: 0 });
    }

    const source = criteria.fromListId ? 'import' : 'manual';
    const added = await addUsersToList(list.id, userIds, source);

    return NextResponse.json({ success: true, added, matched: userIds.length });
  } catch (error) {
    console.error('Mail list bulk add error:', error);
    return NextResponse.json({ error: 'Failed to add members' }, { status: 500 });
  }
}
