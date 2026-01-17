import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
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

export async function GET(request: NextRequest) {
  try {
    await initDatabase();

    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      );
    }

    const topics = await ChatTopic.findAll({
      where: { userId },
      order: [['updatedAt', 'DESC']],
    });

    return NextResponse.json({
      topics: topics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        createdAt: topic.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('Get topics error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка' },
      { status: 500 }
    );
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

    const { title } = await request.json();

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Название темы обязательно' },
        { status: 400 }
      );
    }

    const topic = await ChatTopic.create({
      userId,
      title: title.trim(),
    });

    return NextResponse.json({
      topic: {
        id: topic.id,
        title: topic.title,
        createdAt: topic.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Create topic error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка при создании темы' },
      { status: 500 }
    );
  }
}
