import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import MailList from '@/models/MailList';
import MailListMember from '@/models/MailListMember';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const list = await MailList.findByPk(Number(id));
    if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 });

    const { name, description } = await request.json();
    await list.update({
      ...(name !== undefined ? { name: String(name) } : {}),
      ...(description !== undefined ? { description: description ? String(description) : null } : {}),
    });

    return NextResponse.json({ list });
  } catch (error) {
    console.error('Mail list PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update list' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const list = await MailList.findByPk(Number(id));
    if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 });

    await MailListMember.destroy({ where: { listId: list.id } });
    await list.destroy();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mail list DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete list' }, { status: 500 });
  }
}
