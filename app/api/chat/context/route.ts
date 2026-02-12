import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { initDatabase } from '@/lib/initDb';
import UserAnketa from '@/models/UserAnketa';
import NatalChart from '@/models/NatalChart';
import { SELF_KNOWLEDGE_QUESTION_TITLES } from '@/lib/self-knowledge-questions';

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

/** Возвращает имя (из анкеты), флаг основной натальной карты и список вопросов самопознания для приветственного экрана чата */
export async function GET(request: NextRequest) {
  try {
    await initDatabase();

    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const [anketa, mainChart] = await Promise.all([
      UserAnketa.findOne({ where: { userId } }),
      NatalChart.findOne({ where: { userId, isMain: true } }),
    ]);

    const name = anketa?.name?.trim() || null;
    const hasMainNatalChart = !!mainChart;

    return NextResponse.json({
      name,
      hasMainNatalChart,
      selfKnowledgeQuestions: SELF_KNOWLEDGE_QUESTION_TITLES,
    });
  } catch (error: any) {
    console.error('Chat context error:', error);
    return NextResponse.json(
      { error: error.message || 'Ошибка при получении контекста' },
      { status: 500 }
    );
  }
}
