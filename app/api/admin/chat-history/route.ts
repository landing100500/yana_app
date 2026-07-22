import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initDatabase } from '@/lib/initDb';
import ChatRequestLog from '@/models/ChatRequestLog';
import User from '@/models/User';
import ChatTopic from '@/models/ChatTopic';
import UserAnketa from '@/models/UserAnketa';
import { buildPaginationMeta, parsePagination } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

export async function GET(request: NextRequest) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await initDatabase();

    const { page, limit, offset } = parsePagination(request.nextUrl.searchParams, 30);

    const { rows: logs, count } = await ChatRequestLog.findAndCountAll({
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      include: [
        { model: User, attributes: ['id', 'phone', 'name'] },
        { model: ChatTopic, attributes: ['id', 'title', 'userId'] },
      ],
    });

    const userIds = Array.from(new Set(logs.map((l) => l.userId)));
    const anketas = userIds.length
      ? await UserAnketa.findAll({
          where: { userId: userIds },
          attributes: ['userId', 'name'],
        })
      : [];
    const nameByUserId = new Map(anketas.map((a) => [a.userId, a.name?.trim() || null]));

    const items = logs.map((log) => {
      const user = log.get('User') as User | undefined;
      const topic = log.get('ChatTopic') as ChatTopic | undefined;
      const sectionRefs = (log.sectionRefs || []) as { id: string; name: string }[];
      const userName = nameByUserId.get(log.userId) ?? (user as { name?: string })?.name ?? null;
      const userPhone = (user as { phone?: string })?.phone ?? '';

      return {
        id: log.id,
        createdAt: log.createdAt,
        userId: log.userId,
        userDisplay: userName || userPhone || `User #${log.userId}`,
        userPhone,
        topicId: log.topicId,
        topicTitle: topic?.title ?? '',
        sectionRefs,
      };
    });

    return NextResponse.json({
      items,
      ...buildPaginationMeta(count, page, limit),
    });
  } catch (error: unknown) {
    console.error('Chat history error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка при загрузке истории' },
      { status: 500 }
    );
  }
}
