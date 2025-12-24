import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import ChatTopic from '@/models/ChatTopic';
import Message from '@/models/Message';
import { initDatabase } from '@/lib/initDb';

const JWT_SECRET = process.env.JWT_SECRET || 'yasna-secret-key-change-in-production';

async function getUserId(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    return decoded.userId;
  } catch {
    return null;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initDatabase();

    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      );
    }

    const topicId = parseInt(params.id);

    const topic = await ChatTopic.findOne({
      where: { id: topicId, userId },
    });

    if (!topic) {
      return NextResponse.json(
        { error: 'Тема не найдена' },
        { status: 404 }
      );
    }

    // Удаляем все сообщения топика (CASCADE должен удалить автоматически, но на всякий случай)
    await Message.destroy({
      where: { topicId },
    });

    // Удаляем топик
    await topic.destroy();

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error('Delete topic error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка при удалении темы' },
      { status: 500 }
    );
  }
}

