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

/** Область памяти, которую обязательно использовать для трактовки натальной карты и любых вопросов о пользователе */
const CHART_INTERPRETATION_SECTION = 'Как трактовать карту - 1 часть';

const SYSTEM_PROMPT = `Ты умный агент по астропсихологии.

ЖЁСТКИЕ ПРАВИЛА (обязательны к выполнению):

1. Любой вопрос пользователя о себе рассматривай через его натальную карту. У каждого пользователя есть натальная карта (она передаётся в блоке "Данные пользователя и натальная карта"). Сначала смотри данные карты, затем формулируй ответ.

2. Для трактовки, расшифровки и интерпретации натальной карты используй ТОЛЬКО информацию из области памяти "Как трактовать карту - 1 часть". Ниже тебе передаётся блок с этой областью — это единственный допустимый источник правил и методик трактовки. Не опирайся на общие знания модели по расшифровке карты, только на этот блок.

3. Алгоритм ответа на вопросы о пользователе и/или о его карте: (а) посмотри данные натальной карты пользователя из блока "Данные пользователя и натальная карта"; (б) расшифруй карту по правилам из области "Как трактовать карту - 1 часть"; (в) сформируй ответ на основе этой расшифровки и вопроса пользователя.

4. Дополнительные области памяти (если переданы отдельным блоком) можно использовать для стилистики и уточнений, но правила трактовки карты бери только из "Как трактовать карту - 1 часть".`;

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
    // Для трактовки карты и вопросов о пользователе жёстко подтягиваем область "Как трактовать карту - 1 часть"
    let chartInterpretationChunks: Array<{ text: string; sectionId: string; sectionName?: string }> = [];
    if (mainChart) {
      chartInterpretationChunks = await getChunksFromSectionByName(CHART_INTERPRETATION_SECTION, message, 10);
      if (chartInterpretationChunks.length === 0) {
        chartInterpretationChunks = await getChunksFromSectionByName(CHART_INTERPRETATION_SECTION, 'натальная карта трактовка расшифровка', 10);
      }
      const seen = new Set(relevantChunks.map((c) => c.text));
      for (const ch of chartInterpretationChunks) {
        if (!seen.has(ch.text)) {
          seen.add(ch.text);
          relevantChunks.push(ch);
        }
      }
    }
    console.log(`Found ${relevantChunks.length} relevant chunks (chart interpretation: ${chartInterpretationChunks.length})`);

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

    // Блок "Как трактовать карту - 1 часть" — единственный источник правил трактовки (всегда в начале, если есть карта)
    let chartInterpretationBlock = '';
    if (mainChart && chartInterpretationChunks.length > 0) {
      chartInterpretationBlock = '\n\n--- Как трактовать карту - 1 часть (ЕДИНСТВЕННЫЙ ИСТОЧНИК для трактовки и расшифровки натальной карты пользователя — используй ТОЛЬКО эти правила) ---\n';
      chartInterpretationChunks.forEach((chunk, index) => {
        chartInterpretationBlock += `\n[${index + 1}]\n${chunk.text}\n`;
      });
      chartInterpretationBlock += '\n--- Конец блока "Как трактовать карту - 1 часть" ---\n';
    }

    // Остальная релевантная информация из областей памяти
    let contextText = '';
    if (relevantChunks.length > 0) {
      contextText = '\n\n--- Релевантная информация из других областей памяти ---\n';
      relevantChunks.forEach((chunk, index) => {
        contextText += `\n[Источник ${index + 1}${chunk.sectionName ? ` - ${chunk.sectionName}` : ''}]\n${chunk.text}\n`;
      });
      contextText += '\n--- Конец блока ---\n';
    } else if (!chartInterpretationBlock) {
      contextText = '\n\n--- Релевантная информация из областей памяти не найдена. Если вопрос о пользователе или его карте — используй блок "Как трактовать карту - 1 часть" и данные карты выше. ---\n';
    }

    // Формируем системный промпт: память + другие диалоги + резюме + данные пользователя и карты + блок трактовки карты + остальные области памяти
    const systemMessage = {
      role: 'system' as const,
      content:
        SYSTEM_PROMPT
        + userMemoryBlock
        + otherTopicsBlock
        + topicSummaryBlock
        + (userContext ? `\n\n--- Данные пользователя и натальная карта (всегда смотри сюда для вопросов о пользователе; расшифровывай по правилам из блока ниже) ---\n${userContext}\n--- Конец данных пользователя ---` : '')
        + chartInterpretationBlock
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

