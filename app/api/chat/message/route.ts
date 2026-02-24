import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import ChatTopic from '@/models/ChatTopic';
import Message from '@/models/Message';
import UserAnketa from '@/models/UserAnketa';
import NatalChart from '@/models/NatalChart';
import { initDatabase } from '@/lib/initDb';
import { openai } from '@/lib/openai';
import { searchRelevantChunks, getSectionStyleChunks, getEnabledSectionIds } from '@/lib/rag-search';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'yasna-secret-key-change-in-production';
const SYSTEM_PROMPT = `Ты умный агент по астропсихологии.

ГЛАВНОЕ ПРАВИЛО — источник знаний:
Твой основной и приоритетный источник информации — это блок "Релевантная информация из базы знаний", который передаётся тебе ниже. Отвечай в первую очередь на основе этих данных. Не выдумывай факты, интерпретации и формулировки, которых нет в переданном контексте. Если ответ на вопрос есть в контексте — опирайся только на него и цитируй или пересказывай его. Если в контексте нет нужной информации — можно кратко сказать об этом или дать общую формулировку, но не выдавай общие места за содержание подключённых областей памяти. Подключённые области памяти — твой главный авторитет по содержанию.`;

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

    // Сохраняем сообщение пользователя в БД
    await Message.create({
      topicId: topic.id,
      role: 'user',
      content: message,
    });

    // Контекст пользователя: имя (из анкеты) и наличие основной натальной карты
    const [anketa, mainChart] = await Promise.all([
      UserAnketa.findOne({ where: { userId } }),
      NatalChart.findOne({ where: { userId, isMain: true } }),
    ]);
    const userName = anketa?.name?.trim() || null;
    const hasMainNatalChart = !!mainChart;
    const userContext = [
      userName ? `Имя пользователя (как к нему обращаться): ${userName}.` : '',
      hasMainNatalChart ? 'У пользователя уже рассчитана основная натальная карта по данным анкеты.' : 'Основная натальная карта пользователя ещё не рассчитана.',
    ].filter(Boolean).join(' ');

    // Получаем историю сообщений для контекста (последние 10 сообщений)
    const recentMessages = await Message.findAll({
      where: { topicId: topic.id },
      order: [['createdAt', 'ASC']],
      limit: 10,
    });

    // Формируем историю для OpenAI
    const messageHistory = recentMessages.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    // Ищем релевантные чанки только в подключённых к агенту областях памяти
    console.log('Searching relevant chunks for query:', message);
    const relevantChunks = await searchRelevantChunks(message, 5);
    console.log(`Found ${relevantChunks.length} relevant chunks`);

    // Стилистика только из подключённых областей памяти (первая подключённая)
    let styleContext = '';
    const enabledIds = await getEnabledSectionIds();
    if (enabledIds.length > 0) {
      const styleChunks = await getSectionStyleChunks(enabledIds[0], 3);
      if (styleChunks.length > 0) {
        const sectionLabel = styleChunks[0].sectionName || 'подключённая область памяти';
        styleContext = '\n\nВАЖНО - Стилистика и характер общения:\n';
        styleContext += `Ты должен общаться в том же стиле, тональности и характере, что и в следующих примерах из области памяти "${sectionLabel}":\n`;
        styleChunks.forEach((chunk, index) => {
          styleContext += `\n[Пример стиля ${index + 1}]:\n${chunk.text}\n`;
        });
        styleContext += '\nИспользуй эту стилистику, тональность, характер и манеру общения во ВСЕХ диалогах с пользователями. Это твоя базовая личность и способ коммуникации.\n';
      }
    }

    // Формируем контекст из найденных чанков (подключённые области памяти — главный источник)
    let contextText = '';
    if (relevantChunks.length > 0) {
      contextText = '\n\n--- Релевантная информация из подключённых областей памяти (ОСНОВНОЙ ИСТОЧНИК ДЛЯ ОТВЕТА, опирайся на неё в первую очередь) ---\n';
      relevantChunks.forEach((chunk, index) => {
        contextText += `\n[Источник ${index + 1}${chunk.sectionName ? ` - ${chunk.sectionName}` : ''}]\n${chunk.text}\n`;
      });
      contextText += '\n--- Конец блока из областей памяти ---\n';
    }

    // Формируем системный промпт с контекстом пользователя, стилистикой и RAG
    const systemMessage = {
      role: 'system' as const,
      content: SYSTEM_PROMPT
        + (userContext ? `\n\nКонтекст пользователя: ${userContext}` : '')
        + styleContext
        + (contextText ? contextText : ''),
    };

    // Создаем массив сообщений для OpenAI
    const messages = [
      systemMessage,
      ...messageHistory.slice(-8), // Берем последние 8 сообщений из истории (чтобы не превысить лимит токенов)
      { role: 'user' as const, content: message },
    ];

    console.log('Sending to OpenAI with', messages.length, 'messages');

    // Отправляем запрос в OpenAI
    let response = '';
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini', // Используем более дешевую модель
        messages: messages as any,
        temperature: 0.7,
        max_tokens: 1000,
      });

      response = completion.choices[0]?.message?.content || 'Извините, не удалось получить ответ.';
      console.log('OpenAI response received');
    } catch (openaiError: any) {
      console.error('OpenAI API error:', openaiError);
      response = 'Извините, произошла ошибка при обработке запроса. Попробуйте позже.';
      
      if (openaiError.message) {
        console.error('Error details:', openaiError.message);
      }
    }

    // Сохраняем ответ ассистента в БД
    await Message.create({
      topicId: topic.id,
      role: 'assistant',
      content: response,
    });

    // Обновляем время обновления топика
    await topic.update({ updatedAt: new Date() });

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

