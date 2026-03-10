import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import ChatTopic from '@/models/ChatTopic';
import Message from '@/models/Message';
import ChatRequestLog from '@/models/ChatRequestLog';
import UserAnketa from '@/models/UserAnketa';
import NatalChart from '@/models/NatalChart';
import UserMemory from '@/models/UserMemory';
import { initDatabase } from '@/lib/initDb';
import { openai } from '@/lib/openai';
import { searchRelevantChunks, getSectionStyleChunks, getEnabledSectionIds, getChunksFromSectionByName } from '@/lib/rag-search';
import {
  getTopicContext,
  appendUserMemory,
  extractUserFacts,
} from '@/lib/chat-memory';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'yasna-secret-key-change-in-production';

const SIGN_NAMES = ['Меша', 'Вришабха', 'Митхуна', 'Карка', 'Симха', 'Канья', 'Тула', 'Вришчика', 'Дхану', 'Макара', 'Кумбха', 'Мина'];
function longitudeToSignName(lon: number): string {
  const n = ((lon % 360) + 360) % 360;
  return SIGN_NAMES[Math.floor(n / 30) % 12];
}

function buildChartSummary(chart: NatalChart): string {
  const s = (lon: number) => longitudeToSignName(lon);
  return [
    `Дата и время: ${chart.chartDate} ${chart.chartTime}, место: ${chart.chartCity}.`,
    `Асцендент: ${s(chart.ascendant)}.`,
    `Солнце: ${s(chart.sun)}, Луна: ${s(chart.moon)}, Меркурий: ${s(chart.mercury)}, Венера: ${s(chart.venus)}, Марс: ${s(chart.mars)}, Юпитер: ${s(chart.jupiter)}, Сатурн: ${s(chart.saturn)}.`,
    `Раху: ${s(chart.northNode)}, Кету: ${s(chart.southNode)}.`,
  ].join(' ');
}

const SYSTEM_PROMPT = `Ты умный агент по астропсихологии.

Поведение по умолчанию — активное использование всех доступных источников:
1. Ниже тебе передаются два блока: "Данные пользователя и натальная карта" и "Релевантная информация из подключённых областей памяти". Ты обязан учитывать оба. Для вопросов о пользователе или его натальной карте — смотри данные карты и интерпретируй их на основе областей памяти (например, раздел про интерпретацию натальной карты).
2. Если в областях памяти есть принципы интерпретации, методики или примеры — применяй их к данным натальной карты пользователя и давай ответ на основе этого, а не общие фразы.
3. Если по областям памяти нет подходящего материала — скажи об этом и при необходимости опирайся на переданный контекст пользователя и общие принципы, не выдавая их за содержание областей памяти.
4. Не отвечай шаблонно "нет информации в областях памяти", не проверив оба блока: сначала убедись, что использовал и данные карты, и разделы памяти.`;

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
    const userMessage = await Message.create({
      topicId: topic.id,
      role: 'user',
      content: message,
    });

    // Контекст пользователя: анкета + полные данные натальной карты (чтобы ИИ мог интерпретировать по областям памяти)
    const [anketa, mainChart] = await Promise.all([
      UserAnketa.findOne({ where: { userId } }),
      NatalChart.findOne({ where: { userId, isMain: true } }),
    ]);
    const userName = anketa?.name?.trim() || null;
    const userContextParts: string[] = [];
    if (userName) userContextParts.push(`Имя (как обращаться): ${userName}.`);
    if (anketa?.gender) userContextParts.push(`Пол: ${anketa.gender}.`);
    if (anketa?.birthDate) userContextParts.push(`Дата рождения: ${anketa.birthDate}.`);
    if (anketa?.birthCity) userContextParts.push(`Город рождения: ${anketa.birthCity}.`);
    if (anketa?.birthTime) userContextParts.push(`Время рождения: ${anketa.birthTime}.`);
    if (mainChart) {
      userContextParts.push('Натальная карта пользователя (основная, по анкете):');
      userContextParts.push(buildChartSummary(mainChart));
    } else {
      userContextParts.push('Основная натальная карта пользователя ещё не рассчитана.');
    }
    const userContext = userContextParts.join(' ');

    // Память о пользователе (факты из прошлых диалогов)
    const userMemoryRow = await UserMemory.findOne({ where: { userId } });
    const userMemoryBlock = userMemoryRow?.facts?.trim()
      ? `\n\n--- Память о пользователе (из прошлых диалогов) ---\n${userMemoryRow.facts.trim()}\n--- Конец памяти ---`
      : '';

    // Контекст из других топиков пользователя (последние 3, по 2 последних сообщения)
    const otherTopics = await ChatTopic.findAll({
      where: { userId },
      order: [['updatedAt', 'DESC']],
      limit: 4,
    });
    const otherTopicsFiltered = otherTopics.filter((t) => t.id !== topic.id).slice(0, 3);
    let otherTopicsBlock = '';
    if (otherTopicsFiltered.length > 0) {
      const parts: string[] = [];
      for (const t of otherTopicsFiltered) {
        const lastMsgs = await Message.findAll({
          where: { topicId: t.id },
          order: [['createdAt', 'DESC']],
          limit: 2,
          attributes: ['role', 'content'],
        });
        const preview = lastMsgs
          .reverse()
          .map((m) => (m.role === 'user' ? `П: ${m.content.slice(0, 80)}${m.content.length > 80 ? '…' : ''}` : `ИИ: ${m.content.slice(0, 80)}${m.content.length > 80 ? '…' : ''}`))
          .join(' | ');
        parts.push(`«${t.title}»: ${preview}`);
      }
      otherTopicsBlock = '\n\n--- Другие диалоги пользователя (кратко) ---\n' + parts.join('\n') + '\n--- Конец ---';
    }

    // История текущего топика: резюме длинной части + последние 25 сообщений (уже включают текущее сообщение пользователя)
    const { summary: topicSummary, recentMessages: messageHistory } = await getTopicContext(topic.id);
    const topicSummaryBlock = topicSummary
      ? '\n\n--- Резюме предыдущей части этого диалога ---\n' + topicSummary + '\n--- Конец резюме ---'
      : '';

    // Ищем релевантные чанки в подключённых областях памяти (больше чанков; при 0 — второй проход с более низким порогом)
    console.log('Searching relevant chunks for query:', message);
    let relevantChunks = await searchRelevantChunks(message, 10);
    if (relevantChunks.length === 0) {
      relevantChunks = await searchRelevantChunks(message, 10, undefined, { minSimilarity: 0.25 });
    }
    // Если у пользователя есть натальная карта — дополнительно подтягиваем чанки из раздела "Интерпретация натальной карты"
    if (mainChart) {
      const interpretationChunks = await getChunksFromSectionByName('Интерпретация натальной карты', message, 6);
      const seen = new Set(relevantChunks.map((c) => c.text));
      for (const ch of interpretationChunks) {
        if (!seen.has(ch.text)) {
          seen.add(ch.text);
          relevantChunks.push(ch);
        }
      }
    }
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

    // Формируем контекст из найденных чанков (подключённые области памяти — главный, но не единственный источник)
    let contextText = '';
    if (relevantChunks.length > 0) {
      contextText = '\n\n--- Релевантная информация из подключённых областей памяти (ОСНОВНОЙ ИСТОЧНИК — опирайся на неё в первую очередь) ---\n';
      relevantChunks.forEach((chunk, index) => {
        contextText += `\n[Источник ${index + 1}${chunk.sectionName ? ` - ${chunk.sectionName}` : ''}]\n${chunk.text}\n`;
      });
      contextText += '\n--- Конец блока из областей памяти ---\n';
    } else {
      contextText = '\n\n--- Релевантная информация из областей памяти не найдена для данного запроса. Сначала честно отметь, что по подключённым областям памяти прямой информации по этому запросу нет, а затем, при необходимости, можешь дать общий ответ, опираясь на свои астрологические знания и переданный контекст пользователя. Не выдавай общий ответ за содержание областей памяти. ---\n';
    }

    // Формируем системный промпт: память пользователя + другие диалоги + резюме топика + данные пользователя и карты + области памяти
    const systemMessage = {
      role: 'system' as const,
      content:
        SYSTEM_PROMPT
        + userMemoryBlock
        + otherTopicsBlock
        + topicSummaryBlock
        + (userContext ? `\n\n--- Данные пользователя и натальная карта (используй для ответов о пользователе и его карте) ---\n${userContext}\n--- Конец данных пользователя ---` : '')
        + styleContext
        + (contextText ? contextText : ''),
    };

    // История уже включает текущее сообщение пользователя (последние до 25 сообщений)
    const messages = [systemMessage, ...messageHistory];

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
    const assistantMessage = await Message.create({
      topicId: topic.id,
      role: 'assistant',
      content: response,
    });

    // Логируем запрос: какие области памяти использовались
    const sectionRefsMap = new Map<string, string>();
    relevantChunks.forEach((chunk) => {
      if (chunk.sectionId && !sectionRefsMap.has(chunk.sectionId)) {
        sectionRefsMap.set(chunk.sectionId, chunk.sectionName || chunk.sectionId);
      }
    });
    const sectionRefs = Array.from(sectionRefsMap.entries()).map(([id, name]) => ({ id, name }));
    await ChatRequestLog.create({
      userId,
      topicId: topic.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      sectionRefs,
    });

    // Обновляем время обновления топика
    await topic.update({ updatedAt: new Date() });

    // Обновляем долгосрочную память о пользователе (извлечь факты из этого обмена)
    try {
      const newFacts = await extractUserFacts(userMessage.content, response);
      if (newFacts.length > 0) await appendUserMemory(userId, newFacts);
    } catch (memErr) {
      console.warn('User memory update failed:', memErr);
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

