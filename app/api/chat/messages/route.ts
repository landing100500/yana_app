import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import Message from '@/models/Message';
import ChatTopic from '@/models/ChatTopic';
import { initDatabase } from '@/lib/initDb';

export const dynamic = 'force-dynamic';

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

export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      );
    }

    const { topicId, userMessage, assistantMessage } = await request.json();

    if (!topicId || !userMessage || !assistantMessage) {
      return NextResponse.json(
        { error: 'Не все поля заполнены' },
        { status: 400 }
      );
    }

    // Проверяем, что топик принадлежит пользователю
    const topic = await ChatTopic.findOne({
      where: { id: topicId, userId },
    });

    if (!topic) {
      return NextResponse.json(
        { error: 'Топик не найден' },
        { status: 404 }
      );
    }

    // Сохраняем сообщение пользователя
    await Message.create({
      topicId: topic.id,
      role: 'user',
      content: userMessage,
    });

    // Сохраняем ответ ассистента
    await Message.create({
      topicId: topic.id,
      role: 'assistant',
      content: assistantMessage,
    });

    // Обновляем время обновления топика
    await topic.update({ updatedAt: new Date() });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error('Save messages error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка при сохранении сообщений' },
      { status: 500 }
    );
  }
}
