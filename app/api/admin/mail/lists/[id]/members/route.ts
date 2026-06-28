import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import MailList from '@/models/MailList';
import MailListMember from '@/models/MailListMember';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const list = await MailList.findByPk(Number(id));
    if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 });

    const members = await MailListMember.findAll({
      where: { listId: list.id },
      order: [['createdAt', 'DESC']],
    });

    const userIds = members.map((m) => m.userId);
    const users = userIds.length
      ? await User.findAll({
          where: { id: userIds },
          attributes: ['id', 'email', 'name', 'planCode'],
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const membersWithUsers = members.map((m) => ({
      ...m.toJSON(),
      user: userMap.get(m.userId) || null,
    }));

    return NextResponse.json({ list, members: membersWithUsers });
  } catch (error) {
    console.error('Mail list members GET error:', error);
    return NextResponse.json({ error: 'Failed to load members' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const list = await MailList.findByPk(Number(id));
    if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 });

    const { userIds } = await request.json();
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'userIds array is required' }, { status: 400 });
    }

    let added = 0;
    for (const userId of userIds) {
      const [, created] = await MailListMember.findOrCreate({
        where: { listId: list.id, userId: Number(userId) },
        defaults: { listId: list.id, userId: Number(userId), source: 'manual' },
      });
      if (created) added++;
    }

    return NextResponse.json({ success: true, added });
  } catch (error) {
    console.error('Mail list members POST error:', error);
    return NextResponse.json({ error: 'Failed to add members' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    await MailListMember.destroy({
      where: { listId: Number(id), userId: Number(userId) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mail list members DELETE error:', error);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }
}
