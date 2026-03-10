import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initDatabase } from '@/lib/initDb';
import ChatRequestLog from '@/models/ChatRequestLog';
import User from '@/models/User';
import ChatTopic from '@/models/ChatTopic';
import Message from '@/models/Message';
import UserAnketa from '@/models/UserAnketa';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

export async function GET() {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await initDatabase();

    const logs = await ChatRequestLog.findAll({
      order: [['createdAt', 'DESC']],
      limit: 200,
      include: [
        { model: User, attributes: ['id', 'phone', 'name'] },
        { model: ChatTopic, attributes: ['id', 'title', 'userId'] },
      ],
    });

    const topicIds = Array.from(new Set(logs.map((l) => l.topicId)));
    const messagesByTopic = new Map<number, { role: string; content: string; createdAt: Date }[]>();

    if (topicIds.length > 0) {
      const messages = await Message.findAll({
        where: { topicId: topicIds },
        order: [['createdAt', 'ASC']],
        attributes: ['topicId', 'role', 'content', 'createdAt'],
      });
      messages.forEach((m) => {
        const list = messagesByTopic.get(m.topicId) || [];
        list.push({
          role: m.role,
          content: m.content.length > 500 ? m.content.slice(0, 500) + '…' : m.content,
          createdAt: m.createdAt,
        });
        messagesByTopic.set(m.topicId, list);
      });
    }

    const userIds = Array.from(new Set(logs.map((l) => l.userId)));
    const anketas = await UserAnketa.findAll({
      where: { userId: userIds },
      attributes: ['userId', 'name'],
    });
    const nameByUserId = new Map(anketas.map((a) => [a.userId, a.name?.trim() || null]));

    const items = logs.map((log) => {
      const user = log.get('User') as User | undefined;
      const topic = log.get('ChatTopic') as ChatTopic | undefined;
      const sectionRefs = (log.sectionRefs || []) as { id: string; name: string }[];
      const userName = nameByUserId.get(log.userId) ?? (user as any)?.name ?? null;
      const userPhone = (user as any)?.phone ?? '';

      return {
        id: log.id,
        createdAt: log.createdAt,
        userId: log.userId,
        userDisplay: userName || userPhone || `User #${log.userId}`,
        userPhone,
        topicId: log.topicId,
        topicTitle: topic?.title ?? '',
        sectionRefs,
        messages: messagesByTopic.get(log.topicId) || [],
      };
    });

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error('Chat history error:', error);
    return NextResponse.json(
      { error: error.message || 'Ошибка при загрузке истории' },
      { status: 500 }
    );
  }
}
