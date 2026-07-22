import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import MailList from '@/models/MailList';
import MailListMember from '@/models/MailListMember';
import { fn, col } from 'sequelize';
import { buildPaginationMeta, parsePagination } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const searchParams = request.nextUrl.searchParams;
    const forSelect = searchParams.get('forSelect') === '1';

    if (forSelect) {
      const allLists = await MailList.findAll({
        order: [['name', 'ASC']],
        limit: 500,
      });
      const listIds = allLists.map((l) => l.id);
      const countRows =
        listIds.length > 0
          ? ((await MailListMember.findAll({
              attributes: ['listId', [fn('COUNT', col('id')), 'memberCount']],
              where: { listId: listIds },
              group: ['listId'],
              raw: true,
            })) as unknown as Array<{ listId: number; memberCount: string | number }>)
          : [];
      const countByListId = new Map(countRows.map((r) => [r.listId, Number(r.memberCount) || 0]));
      const lists = allLists.map((list) => ({
        ...list.toJSON(),
        memberCount: countByListId.get(list.id) || 0,
      }));
      return NextResponse.json({ lists });
    }

    const { page, limit, offset } = parsePagination(searchParams, 30);
    const { rows: lists, count } = await MailList.findAndCountAll({
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const listIds = lists.map((l) => l.id);
    const countRows =
      listIds.length > 0
        ? ((await MailListMember.findAll({
            attributes: ['listId', [fn('COUNT', col('id')), 'memberCount']],
            where: { listId: listIds },
            group: ['listId'],
            raw: true,
          })) as unknown as Array<{ listId: number; memberCount: string | number }>)
        : [];

    const countByListId = new Map(countRows.map((r) => [r.listId, Number(r.memberCount) || 0]));
    const withCounts = lists.map((list) => ({
      ...list.toJSON(),
      memberCount: countByListId.get(list.id) || 0,
    }));

    return NextResponse.json({
      lists: withCounts,
      ...buildPaginationMeta(count, page, limit),
    });
  } catch (error) {
    console.error('Mail lists GET error:', error);
    return NextResponse.json({ error: 'Failed to load lists' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { name, description } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const list = await MailList.create({
      name: String(name),
      description: description ? String(description) : null,
    });

    return NextResponse.json({ list });
  } catch (error) {
    console.error('Mail lists POST error:', error);
    return NextResponse.json({ error: 'Failed to create list' }, { status: 500 });
  }
}
