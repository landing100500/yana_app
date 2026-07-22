import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initDatabase } from '@/lib/initDb';
import Message from '@/models/Message';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ topicId: string }> };

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await initDatabase();

    const { topicId } = await context.params;
    const topicIdNum = Number(topicId);
    if (!Number.isFinite(topicIdNum) || topicIdNum <= 0) {
      return NextResponse.json({ error: 'Invalid topicId' }, { status: 400 });
    }

    const messages = await Message.findAll({
      where: { topicId: topicIdNum },
      order: [['createdAt', 'ASC']],
      attributes: ['role', 'content', 'createdAt'],
    });

    const items = messages.map((m) => ({
      role: m.role,
      content: m.content.length > 2000 ? m.content.slice(0, 2000) + '…' : m.content,
      createdAt: m.createdAt,
    }));

    return NextResponse.json({ messages: items });
  } catch (error: unknown) {
    console.error('Chat topic messages error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка при загрузке сообщений' },
      { status: 500 }
    );
  }
}
