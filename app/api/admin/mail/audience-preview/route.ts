import { NextRequest, NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import User from '@/models/User';
import MailList from '@/models/MailList';
import MailListMember from '@/models/MailListMember';
import MailSubscriber from '@/models/MailSubscriber';

export const dynamic = 'force-dynamic';

async function countMailable(userIds: number[]): Promise<{ total: number; mailable: number }> {
  const uniqueIds = Array.from(new Set(userIds.filter((id) => Number.isFinite(id) && id > 0)));
  if (uniqueIds.length === 0) return { total: 0, mailable: 0 };

  const users = await User.findAll({
    where: {
      id: uniqueIds,
      email: { [Op.ne]: null },
      password: { [Op.ne]: null },
    },
    attributes: ['id', 'email'],
  });

  if (users.length === 0) return { total: uniqueIds.length, mailable: 0 };

  const subscribers = await MailSubscriber.findAll({
    where: { userId: users.map((u) => u.id) },
    attributes: ['userId', 'isSubscribed', 'suppressedAt'],
  });
  const subByUser = new Map(subscribers.map((s) => [s.userId, s]));

  let mailable = 0;
  for (const user of users) {
    const sub = subByUser.get(user.id);
    // Нет записи = ещё не отписался; suppressed — не считаем
    if (sub?.suppressedAt) continue;
    if (!sub || sub.isSubscribed) mailable++;
  }

  return { total: uniqueIds.length, mailable };
}

export async function GET(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const audience = request.nextUrl.searchParams.get('audience') || '';
    if (audience === 'all') {
      const users = await User.findAll({
        where: {
          email: { [Op.ne]: null },
          password: { [Op.ne]: null },
        },
        attributes: ['id'],
      });
      const counts = await countMailable(users.map((u) => u.id));
      return NextResponse.json({
        audience: 'all',
        label: 'Все зарегистрированные',
        ...counts,
      });
    }

    if (audience === 'list') {
      const listId = Number(request.nextUrl.searchParams.get('listId'));
      if (!Number.isFinite(listId) || listId <= 0) {
        return NextResponse.json({ error: 'Укажите listId' }, { status: 400 });
      }
      const list = await MailList.findByPk(listId, { attributes: ['id', 'name'] });
      if (!list) return NextResponse.json({ error: 'Список не найден' }, { status: 404 });

      const members = await MailListMember.findAll({
        where: { listId },
        attributes: ['userId'],
      });
      const counts = await countMailable(members.map((m) => m.userId));
      return NextResponse.json({
        audience: 'list',
        listId: list.id,
        label: list.name,
        memberCount: members.length,
        ...counts,
      });
    }

    return NextResponse.json({ error: 'audience=all|list' }, { status: 400 });
  } catch (error) {
    console.error('Audience preview error:', error);
    return NextResponse.json({ error: 'Не удалось посчитать аудиторию' }, { status: 500 });
  }
}
