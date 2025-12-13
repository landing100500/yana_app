import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import ChatTopic from '@/models/ChatTopic';
import { initDatabase } from '@/lib/initDb';

const JWT_SECRET = process.env.JWT_SECRET || 'yasna-secret-key-change-in-production';
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';

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

    const { message, topicId } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Сообщение обязательно' },
        { status: 400 }
      );
    }

    let topic: ChatTopic | null = null;

    if (topicId) {
      topic = await ChatTopic.findOne({
        where: { id: topicId, userId },
      });
    }

    if (!topic) {
      const title = message.length > 50 ? message.substring(0, 50) + '...' : message;
      topic = await ChatTopic.create({
        userId,
        title,
      });
    }

    let response = 'Извините, сервис временно недоступен.';

    if (N8N_WEBHOOK_URL) {
      try {
        const webhookResponse = await axios.post(N8N_WEBHOOK_URL, {
          message,
          userId,
          topicId: topic.id,
        }, {
          timeout: 30000,
        });

        response = webhookResponse.data?.response || webhookResponse.data?.message || response;
      } catch (webhookError: any) {
        console.error('N8N webhook error:', webhookError.message);
        response = 'Произошла ошибка при обработке запроса. Попробуйте позже.';
      }
    }

    return NextResponse.json({
      response,
      topicId: topic.id,
    });
  } catch (error: any) {
    console.error('Send message error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка при отправке сообщения' },
      { status: 500 }
    );
  }
}

