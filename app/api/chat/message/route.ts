import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import ChatTopic from '@/models/ChatTopic';
import Message from '@/models/Message';
import ChatRequestLog from '@/models/ChatRequestLog';
import UserAnketa from '@/models/UserAnketa';
import NatalChart from '@/models/NatalChart';
import UserMemory from '@/models/UserMemory';
import User from '@/models/User';
import { initDatabase } from '@/lib/initDb';
import { openai } from '@/lib/openai';
import { getOpenAiChatModel } from '@/lib/openai-models';
import { alertAdminAsync, alertOpenAiFailure } from '@/lib/admin-alerts';
import {
  searchRelevantChunks,
  getSectionStyleChunks,
  getEnabledSectionIds,
  fetchSectionChunks,
  formatSectionMemoryHint,
  type RagChunk,
} from '@/lib/rag-search';
import {
  getTopicContext,
  appendUserMemory,
  extractUserFacts,
} from '@/lib/chat-memory';
import { getPersonalityReadingAlgorithmEnabled } from '@/lib/app-settings';
import {
  buildPersonalityReadingAlgorithmBlock,
  shouldRunPersonalityReadingAlgorithm,
} from '@/lib/personality-reading-algorithm';
import { reconcileUserPendingPayments } from '@/lib/payments';
import { consumeFreeAiRequest, ensureFreePlanWindow, getFrozenChartIdsForPlan, getUserPlanSnapshot, syncPlanDailyUsage } from '@/lib/subscription';
import { getChatBlockState } from '@/lib/plan-access';
import { getTariffsLinkMarkdown } from '@/lib/plan-messages';
import { getPromptServerNowBlock } from '@/lib/prompt-datetime';
import { calculateTransitIngressTimeline, calculateTransitPositions } from '@/lib/transit-calculator';
import { utcNowToFixedOffsetLocal } from '@/lib/swisseph-vedic';
import { formatVimshottariForPrompt } from '@/lib/vimshottari-dasha';

export const dynamic = 'force-dynamic';
/** Долгие RAG + GPT; на self-hosted без лимита, на serverless — увеличивает таймаут платформы */
export const maxDuration = 600;

const JWT_SECRET = process.env.JWT_SECRET || 'yasna-secret-key-change-in-production';
const SIGN_NAMES = ['Меша', 'Вришабха', 'Митхуна', 'Карка', 'Симха', 'Канья', 'Тула', 'Вришчика', 'Дхану', 'Макара', 'Кумбха', 'Мина'];
function longitudeToSignName(lon: number): string {
  const n = ((lon % 360) + 360) % 360;
  return SIGN_NAMES[Math.floor(n / 30) % 12];
}

function buildChartSummary(chart: NatalChart): string {
  const s = (lon: number) => longitudeToSignName(lon);
  const d = (lon: number) => `${(((lon % 360) + 360) % 360).toFixed(2)}°`;
  const inSignDegree = (lon: number) => `${((((lon % 360) + 360) % 360) % 30).toFixed(2)}°`;
  const moonLon = Number(chart.moon);
  const timezone = Number(chart.timezone) || 0;
  const vimshottari = formatVimshottariForPrompt({
    moonLongitude: moonLon,
    birthDate: chart.chartDate,
    birthTime: chart.chartTime,
    timezone,
  });
  return [
    `Дата и время: ${chart.chartDate} ${chart.chartTime}, место: ${chart.chartCity}.`,
    `Асцендент: ${s(chart.ascendant)} (${d(chart.ascendant)}).`,
    `Солнце: ${s(chart.sun)} (${d(chart.sun)}), Луна: ${s(chart.moon)} (${d(chart.moon)}), Меркурий: ${s(chart.mercury)} (${d(chart.mercury)}), Венера: ${s(chart.venus)} (${d(chart.venus)}), Марс: ${s(chart.mars)} (${d(chart.mars)}), Юпитер: ${s(chart.jupiter)} (${d(chart.jupiter)}), Сатурн: ${s(chart.saturn)} (${d(chart.saturn)}).`,
    `Раху: ${s(chart.northNode)} (${d(chart.northNode)}), Кету: ${s(chart.southNode)} (${d(chart.southNode)}).`,
    `Градусы планет внутри знака (для расчёта Атмакараки): Солнце ${inSignDegree(chart.sun)}, Луна ${inSignDegree(chart.moon)}, Меркурий ${inSignDegree(chart.mercury)}, Венера ${inSignDegree(chart.venus)}, Марс ${inSignDegree(chart.mars)}, Юпитер ${inSignDegree(chart.jupiter)}, Сатурн ${inSignDegree(chart.saturn)}.`,
    vimshottari,
  ].join(' ');
}

const ASCENDANT_BOOK_SECTION: Record<string, string> = {
  Меша: 'Овен книга про тип характера',
  Вришабха: 'Телец книга',
  Митхуна: 'Близнецы книга',
  Карка: 'Рак книга',
  Симха: 'Лев книга',
  Канья: 'Дева книга',
  Тула: 'Весы книга',
  Вришчика: 'Скорпион книга',
  Дхану: 'Стрелец книга',
  Макара: 'Козерог книга',
  Кумбха: 'Водолей книга',
  Мина: 'Рыбы книга',
};

/** Область памяти, которую обязательно использовать для трактовки натальной карты и любых вопросов о пользователе */
const CHART_INTERPRETATION_SECTION = 'Как трактовать карту - 1 часть';
/** Область памяти, которую обязательно использовать для вопросов по Атмакараке */
const ATMAKARAKA_SECTION = 'Интерпретация натальной карты';
/** Область памяти: предсказание, транзиты, прогноз (должно совпадать с названием раздела в админке) */
const PREDICTION_SECTION = 'ПРЕДСКАЗАНИЕ';

/** Вопросы, для которых принудительно подгружается область «ПРЕДСКАЗАНИЕ» (если раздел есть и подключён к агенту) */
const PREDICTION_TOPIC_RX =
  /транзит|предсказ|прогноз|гочар|gochar|что\s+жд[её]т|что\s+меня\s+жд|что\s+будет|будущ(ее|его|ем|им)?|впереди|текущ(ий|ая|ее|ие)\s+(год|месяц|сезон|период)|ближайш|когда\s+лучше|ретроград|санкрант|солнцесто(яние|ни)|равноденств|затмен|полнолун|новолун|экадаш|какой\s+сейчас\s+период|ожидает|перспектив|астропрогноз/i;

function parseTransitYearRange(message: string): { fromYear: number; toYear: number } | null {
  const years: number[] = [];
  const rx = /\b(20\d{2})\b/g;
  let match = rx.exec(message);
  while (match) {
    const y = Number(match[1]);
    if (y >= 1900 && y <= 2200) years.push(y);
    match = rx.exec(message);
  }
  if (years.length === 0) return null;
  const fromYear = Math.min(...years);
  const toYear = Math.max(...years);
  return { fromYear, toYear };
}

function inferTransitPlanets(message: string): string[] {
  const m = message.toLowerCase();
  const requested = new Set<string>();
  if (/юпитер|jupiter/.test(m)) requested.add('jupiter');
  if (/венер|venus/.test(m)) requested.add('venus');
  if (/сатурн|saturn/.test(m)) requested.add('saturn');
  if (/марс|mars/.test(m)) requested.add('mars');
  if (/меркур|mercury/.test(m)) requested.add('mercury');
  if (/солнц|sun/.test(m)) requested.add('sun');
  if (/лун|moon/.test(m)) requested.add('moon');
  if (/раху|узел|node/.test(m)) requested.add('northNode');
  if (requested.size === 0) {
    return ['jupiter', 'saturn', 'venus', 'northNode'];
  }
  if (!requested.has('jupiter')) requested.add('jupiter');
  if (!requested.has('venus')) requested.add('venus');
  return Array.from(requested);
}

const SYSTEM_PROMPT = `Ты умный агент по астропсихологии.

ЖЁСТКИЕ ПРАВИЛА (обязательны к выполнению):

0. **Именованные разделы памяти** (в т.ч. «Как трактовать карту - 1 часть», «Интерпретация натальной карты», «ПРЕДСКАЗАНИЕ»). Правила с фрагментами из области — **только если** ниже есть блок с текстом из этой области. Если блока с фрагментами нет — смотри блоки **«Статус области …»**: (а) «раздел не найден» или «не подключён к агенту» — честно скажи, что области нет в подключённой памяти; (б) «подключён, но фрагменты не подобрались» — **не** утверждай, что области нет; отвечай по **данным карты**, **расчётным транзитам** и **другим** фрагментам. Не подменяй отсутствующий раздел внутренними знаниями модели.

1. Любой вопрос пользователя о себе, своей жизни, предназначении, личных качествах, отношениях и т.п. рассматривай через его натальную карту. У каждого пользователя есть натальная карта (она передаётся в блоке "Данные пользователя и натальная карта"). Сначала внимательно смотри данные карты, затем формулируй ответ.

2. Для трактовки, расшифровки и интерпретации **натальной** карты, **когда ниже передан** блок области "Как трактовать карту - 1 часть", используй **только** информацию из этого блока как источник правил и методик такой трактовки. Если этого блока **нет** (см. п. 0) — не придумывай методику; используй данные карты и остальные фрагменты памяти, укажи отсутствие раздела.

3. Алгоритм ответа на вопросы о пользователе и/или о его карте, **если** в сообщении есть блок "Как трактовать карту - 1 часть":
   (а) посмотри данные натальной карты пользователя из блока "Данные пользователя и натальная карта";
   (б) расшифруй карту по правилам из этого блока;
   (в) сформулируй ответ.  
   Если блока трактовки **нет** — отвечай по данным карты и другим фрагментам (п. 0).

4. Дополнительные области памяти (если переданы отдельным блоком) можно использовать для стилистики, примеров и уточнений. **Правила натальной трактовки** — из п. 2; **предсказания/транзиты** — в приоритете из п. 8, **когда** передан блок «ПРЕДСКАЗАНИЕ».

5. По астрологическим темам (натальные карты, транзиты, дома, знаки, аспекты, предназначение и т.п.) не добавляй ничего из внутренних знаний модели, если это **прямо** не следует из **подключённых** фрагментов. Лучше сказать, что в памяти нет такой информации, чем выдумывать.

6. Объём ответа всегда согласовывай с вопросом:
   - если пользователь задаёт общий вопрос ("что особенного в моей натальной карте?", "что ты обо мне знаешь?") — дай концентрированный ответ: 3–5 абзацев, только самые ключевые особенности, без полной тотальной расшифровки всей карты;
   - в конце такого ответа обязательно предложи варианты продолжения (например: "Хочешь, расскажу подробнее про предназначение, отношения или деньги?") и ЖДИ следующего вопроса, вместо того чтобы сразу вываливать всё.
   - развёрнутые, длинные разборы отдельных тем (предназначение, отношения, деньги и т.д.) давай только если пользователь явно попросил рассказать подробнее именно про эту тему.

7. Атмакарака, характеристики Атмакараки: **если** в системном сообщении **есть** отдельный блок "Интерпретация натальной карты" — опирайся на него вместе с данными карты; **без** этого блока (см. п. 0) — не выдумывай расчёты и определения.

8. **Предсказание, прогноз, транзиты, течение времени, «что ждёт», периоды, ретрограды, текущий/ближайший этап** и сходн. вопросы: **если** ниже передан блок **«ПРЕДСКАЗАНИЕ»** — используй его **в первую очередь** для методики и формулировок (интерпретация транзитов, периодов, прогноза); **натальные** положения — из блока «Данные пользователя и натальная карта»; **если** блока «ПРЕДСКАЗАНИЕ» **нет** — не придумывай отсутствующую методику; сочетай остальные фрагменты и данные карты, укажи отсутствие раздела при необходимости.`;

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
  let phase = 'init_db';
  let logUserId: number | undefined;
  let logTopicId: number | undefined;
  try {
    await initDatabase();

    phase = 'auth';
    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      );
    }

    logUserId = userId;
    phase = 'plan_check';
    const currentUser = await User.findByPk(userId);
    if (!currentUser) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }
    await reconcileUserPendingPayments(userId);
    await currentUser.reload();
    await ensureFreePlanWindow(currentUser);
    await syncPlanDailyUsage(currentUser);
    const blockState = await getChatBlockState(currentUser);
    if (blockState.blocked) {
      return NextResponse.json({ error: blockState.message, planBlocked: true }, { status: 403 });
    }
    const planBefore = blockState.snapshot;
    const upgradeHint = getTariffsLinkMarkdown('Тарифы');

    phase = 'parse_body';
    const { message, topicId, comparisonMode, selectedChartId } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Сообщение обязательно' },
        { status: 400 }
      );
    }

    phase = 'topic';
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

    logTopicId = topic.id;
    phase = 'save_user_message';
    const userMessage = await Message.create({
      topicId: topic.id,
      role: 'user',
      content: message,
    });

    phase = 'load_context';
    const anketa = await UserAnketa.findOne({ where: { userId } });
    let activeChart: NatalChart | null = null;
    if (selectedChartId !== undefined && selectedChartId !== null && selectedChartId !== '') {
      const parsedSelectedChartId = Number(selectedChartId);
      if (!Number.isInteger(parsedSelectedChartId) || parsedSelectedChartId <= 0) {
        return NextResponse.json(
          { error: 'Неверная выбранная карта' },
          { status: 400 }
        );
      }
      activeChart = await NatalChart.findOne({ where: { id: parsedSelectedChartId, userId } });
      if (!activeChart) {
        return NextResponse.json(
          { error: 'Выбранная карта не найдена. Обновите страницу и выберите карту снова.' },
          { status: 400 }
        );
      }
      const allCharts = await NatalChart.findAll({ where: { userId }, attributes: ['id', 'isMain', 'createdAt'] });
      const frozenIds = getFrozenChartIdsForPlan(planBefore.code, allCharts as any);
      if (frozenIds.has(activeChart.id)) {
        return NextResponse.json(
          { error: `Выбранная карта сейчас заморожена вашим тарифом. ${upgradeHint}` },
          { status: 403 }
        );
      }
    } else {
      activeChart = await NatalChart.findOne({ where: { userId, isMain: true } });
    }
    const userName = anketa?.name?.trim() || null;
    const userContextParts: string[] = [];
    if (userName) userContextParts.push(`Имя (как обращаться): ${userName}.`);
    if (anketa?.gender) userContextParts.push(`Пол: ${anketa.gender}.`);
    if (anketa?.birthDate) userContextParts.push(`Дата рождения: ${anketa.birthDate}.`);
    if (anketa?.birthCity) userContextParts.push(`Город рождения: ${anketa.birthCity}.`);
    if (anketa?.birthTime) userContextParts.push(`Время рождения: ${anketa.birthTime}.`);
    if (activeChart) {
      userContextParts.push(`Натальная карта пользователя (активная для текущего ответа: ${activeChart.name}):`);
      userContextParts.push(buildChartSummary(activeChart));
    } else {
      userContextParts.push('Натальная карта пользователя ещё не рассчитана.');
    }
    const userContext = userContextParts.join(' ');

    let comparisonBlock = '';
    if (comparisonMode?.chartAId && comparisonMode?.chartBId) {
      if (!planBefore.chartComparison) {
        return NextResponse.json(
          { error: `Режим сравнения карт недоступен на вашем тарифе. ${upgradeHint}` },
          { status: 403 }
        );
      }
      const [chartA, chartB] = await Promise.all([
        NatalChart.findOne({ where: { id: Number(comparisonMode.chartAId), userId } }),
        NatalChart.findOne({ where: { id: Number(comparisonMode.chartBId), userId } }),
      ]);
      if (!chartA || !chartB) {
        return NextResponse.json(
          { error: 'Не удалось загрузить выбранные карты для сравнения. Выберите карты заново.' },
          { status: 400 }
        );
      }
      if (chartA.id === chartB.id) {
        return NextResponse.json(
          { error: 'Для сравнения нужно выбрать две разные карты.' },
          { status: 400 }
        );
      }
      const allCharts = await NatalChart.findAll({ where: { userId }, attributes: ['id', 'isMain', 'createdAt'] });
      const frozenIds = getFrozenChartIdsForPlan(planBefore.code, allCharts as any);
      if (frozenIds.has(chartA.id) || frozenIds.has(chartB.id)) {
        return NextResponse.json(
          { error: `Одна из выбранных карт сейчас заморожена вашим тарифом. ${upgradeHint}` },
          { status: 403 }
        );
      }
      const ascA = longitudeToSignName(chartA.ascendant);
      const ascB = longitudeToSignName(chartB.ascendant);
      const sectionA = ASCENDANT_BOOK_SECTION[ascA] || `${ascA} книга`;
      const sectionB = ASCENDANT_BOOK_SECTION[ascB] || `${ascB} книга`;
      const q = `${message}\nСравнение карт: ${chartA.name} и ${chartB.name}`;
      const chunksToText = (arr: Array<{ text: string }>, label: string) =>
        arr.map((c, i) => `\n[${label} ${i + 1}]\n${c.text}\n`).join('');
      try {
        const [compatR, ascAR, ascBR, oporaR, traktR, interpR, planetsR] = await Promise.all([
          fetchSectionChunks('Совместимость в отношениях', q, 8),
          fetchSectionChunks(sectionA, q, 2),
          fetchSectionChunks(sectionB, q, 2),
          fetchSectionChunks('51 опора', `${q} накшатры сферы`, 6),
          fetchSectionChunks('Как трактовать карту - 1 часть', q, 3),
          fetchSectionChunks('Интерпретация натальной карты', q, 2),
          fetchSectionChunks('Интерпретация натальной карты', `${q} Венера Раху Кету Сатурн Меркурий Юпитер Солнце Луна Марс`, 4),
        ]);
        const compat = compatR.chunks;
        const ascAChunks = ascAR.chunks;
        const ascBChunks = ascBR.chunks;
        const opora = oporaR.chunks;
        const trakt = traktR.chunks;
        const interp = interpR.chunks;
        const planets = planetsR.chunks;
        comparisonBlock =
          '\n\n--- Режим сравнения карт (ОБЯЗАТЕЛЕН) ---\n' +
          `Сейчас активен режим совместимости. Строго отвечай на основе СРАВНЕНИЯ двух карт, а не одной.\n` +
          `Карта A: ${chartA.name}. ${buildChartSummary(chartA)}\n` +
          `Карта B: ${chartB.name}. ${buildChartSummary(chartB)}\n` +
          `Вес анализа: 1) Совместимость в отношениях 50%; 2) Книги асцендентов 5%; 3) 51 опора 30%; 4) Как трактовать карту 4%; 5) Интерпретация карты 1%; 6) Сферы по планетам 10%.\n` +
          'Запрещено просить пользователя заново прислать данные второй карты — они уже переданы выше.\n' +
          'Если какой-то из подключаемых разделов пуст — строй ответ по остальным фрагментам и данным карт (см. п. 0 правил агента).\n' +
          chunksToText(compat, 'Совместимость') +
          chunksToText(ascAChunks, `Асцендент ${chartA.name}`) +
          chunksToText(ascBChunks, `Асцендент ${chartB.name}`) +
          chunksToText(opora, '51 опора') +
          chunksToText(trakt, 'Как трактовать') +
          chunksToText(interp, 'Интерпретация') +
          chunksToText(planets, 'Планеты') +
          '\n--- Конец режима сравнения карт ---\n';
      } catch (compareRagErr: any) {
        console.error('Comparison mode RAG error:', compareRagErr);
        comparisonBlock =
          '\n\n--- Режим сравнения карт (ОБЯЗАТЕЛЕН) ---\n' +
          `Карта A: ${chartA.name}. ${buildChartSummary(chartA)}\n` +
          `Карта B: ${chartB.name}. ${buildChartSummary(chartB)}\n` +
          'Фрагменты из областей памяти для сравнения не подгрузились (техническая ошибка). Сравни карты по данным выше; не придумывай отсутствующие разделы.\n' +
          '--- Конец режима сравнения карт ---\n';
      }
    }

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

    phase = 'topic_context';
    const { summary: topicSummary, recentMessages: messageHistory } = await getTopicContext(topic.id);
    const topicSummaryBlock = topicSummary
      ? '\n\n--- Резюме предыдущей части этого диалога ---\n' + topicSummary + '\n--- Конец резюме ---'
      : '';

    phase = 'rag_search';
    let relevantChunks = await searchRelevantChunks(message, 10);
    if (relevantChunks.length === 0) {
      relevantChunks = await searchRelevantChunks(message, 10, undefined, { minSimilarity: 0.25 });
    }
    const isAtmakarakaQuery = /атмакарак|атма-карак|atmakaraka|atma karaka/i.test(message);
    const isPredictionQuery = PREDICTION_TOPIC_RX.test(message);
    let namedSectionHints = '';

    const mergeChunks = (chunks: RagChunk[]) => {
      const seen = new Set(relevantChunks.map((c) => c.text));
      for (const ch of chunks) {
        if (!seen.has(ch.text)) {
          seen.add(ch.text);
          relevantChunks.push(ch);
        }
      }
    };

    // Для трактовки карты и вопросов о пользователе жёстко подтягиваем область "Как трактовать карту - 1 часть"
    let chartInterpretationChunks: RagChunk[] = [];
    if (activeChart) {
      const chartResult = await fetchSectionChunks(
        CHART_INTERPRETATION_SECTION,
        [message, 'натальная карта трактовка расшифровка интерпретация'],
        10
      );
      chartInterpretationChunks = chartResult.chunks;
      namedSectionHints += formatSectionMemoryHint('Как трактовать карту - 1 часть', chartResult);
      mergeChunks(chartInterpretationChunks);
    }

    // Технический safeguard: для вопросов по Атмакараке принудительно подтягиваем область "Интерпретация натальной карты"
    let atmakarakaChunks: RagChunk[] = [];
    if (activeChart && isAtmakarakaQuery) {
      const atmResult = await fetchSectionChunks(
        ATMAKARAKA_SECTION,
        [message, 'атмакарака расчет характеристика трактовка'],
        10
      );
      atmakarakaChunks = atmResult.chunks;
      namedSectionHints += formatSectionMemoryHint('Интерпретация натальной карты', atmResult);
      mergeChunks(atmakarakaChunks);
    }

    // Прогноз / транзиты / предсказание — принудительно область «ПРЕДСКАЗАНИЕ» (если есть в БД и подключена)
    let predictionChunks: RagChunk[] = [];
    if (activeChart && isPredictionQuery) {
      const predResult = await fetchSectionChunks(
        PREDICTION_SECTION,
        [message, 'транзит прогноз предсказание период ретроград гочар'],
        10
      );
      predictionChunks = predResult.chunks;
      namedSectionHints += formatSectionMemoryHint('ПРЕДСКАЗАНИЕ', predResult);
      mergeChunks(predictionChunks);
    }

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
    if (activeChart && chartInterpretationChunks.length > 0) {
      chartInterpretationBlock = '\n\n--- Как трактовать карту - 1 часть (ЕДИНСТВЕННЫЙ ИСТОЧНИК для трактовки и расшифровки натальной карты пользователя — используй ТОЛЬКО эти правила) ---\n';
      chartInterpretationChunks.forEach((chunk, index) => {
        chartInterpretationBlock += `\n[${index + 1}]\n${chunk.text}\n`;
      });
      chartInterpretationBlock += '\n--- Конец блока "Как трактовать карту - 1 часть" ---\n';
    }

    let atmakarakaBlock = '';
    if (activeChart && isAtmakarakaQuery && atmakarakaChunks.length > 0) {
      atmakarakaBlock = '\n\n--- Интерпретация натальной карты (ОБЯЗАТЕЛЬНО для вопросов по Атмакараке) ---\n';
      atmakarakaChunks.forEach((chunk, index) => {
        atmakarakaBlock += `\n[${index + 1}]\n${chunk.text}\n`;
      });
      atmakarakaBlock += '\n--- Конец блока "Интерпретация натальной карты" ---\n';
    }

    let predictionBlock = '';
    if (activeChart && isPredictionQuery && predictionChunks.length > 0) {
      predictionBlock =
        '\n\n--- ПРЕДСКАЗАНИЕ (приоритет для прогноза, транзитов, периодов — см. п. 8 правил) ---\n';
      predictionChunks.forEach((chunk, index) => {
        predictionBlock += `\n[${index + 1}]\n${chunk.text}\n`;
      });
      predictionBlock += '\n--- Конец блока "ПРЕДСКАЗАНИЕ" ---\n';
    }

    let computedTransitBlock = '';
    if (activeChart && isPredictionQuery) {
      try {
        const now = new Date();
        const tz = Number(activeChart.timezone);
        const isValidTimezone = Number.isFinite(tz) ? tz : 0;
        const inferredYears = parseTransitYearRange(message);
        const fromYear = inferredYears ? Math.max(2000, inferredYears.fromYear) : now.getUTCFullYear();
        const requestedToYear = inferredYears
          ? Math.min(2100, Math.max(inferredYears.toYear, inferredYears.fromYear))
          : Math.min(2100, fromYear + 1);
        // Ограничиваем объём, чтобы не раздувать системный промпт
        const toYear = Math.min(requestedToYear, fromYear + 2);
        const planetsForTimeline = inferTransitPlanets(message);
        const timeline = await calculateTransitIngressTimeline({
          fromLocalDate: { year: fromYear, month: 1, day: 1 },
          toLocalDate: { year: toYear, month: 12, day: 31 },
          timezone: isValidTimezone,
          planets: planetsForTimeline,
        });
        const nowLocal = utcNowToFixedOffsetLocal(isValidTimezone);
        const nowTransit = await calculateTransitPositions({
          transitMoment: {
            ...nowLocal,
            latitude: Number(activeChart.chartLatitude),
            longitude: Number(activeChart.chartLongitude),
            timezone: isValidTimezone,
          },
          natalMoonLongitude: Number(activeChart.moon),
          natalAscendantLongitude: Number(activeChart.ascendant),
        });

        const nowLine = nowTransit.planets
          .filter((p) => planetsForTimeline.includes(p.key))
          .map(
            (p) =>
              `${p.label}: ${p.signNameSidereal} ${p.degreeInSign.toFixed(2)}° (${p.nakshatraName}, п.${p.nakshatraPada})${p.isRetrograde ? ' R' : ''}`
          )
          .join('; ');

        let block =
          `\n\n--- РАСЧЁТНЫЕ ТРАНЗИТЫ (Swiss Ephemeris, сидерика Лахири; источник истины для дат входа планет в знаки) ---\n`
          + `Диапазон расчёта: ${fromYear}-${toYear} (локальное время карты, UTC${isValidTimezone >= 0 ? '+' : ''}${isValidTimezone}).\n`
          + `Срез «сейчас» (местное время карты): ${nowLine}\n`;
        for (const row of timeline) {
          block += `\n${row.label}:\n`;
          for (const w of row.windows) {
            block += `- ${w.from} -> ${w.to}: ${w.signNameSidereal}\n`;
          }
        }
        block += 'Используй ТОЛЬКО эти даты для утверждений о транзитах и переходах по знакам.\n';
        block += '--- Конец расчётных транзитов ---\n';
        computedTransitBlock = block;
      } catch (transitErr) {
        console.error('Computed transit block error:', transitErr);
      }
    }

    // Остальная релевантная информация из областей памяти
    let contextText = '';
    if (relevantChunks.length > 0) {
      contextText = '\n\n--- Релевантная информация из других областей памяти ---\n';
      relevantChunks.forEach((chunk, index) => {
        contextText += `\n[Источник ${index + 1}${chunk.sectionName ? ` - ${chunk.sectionName}` : ''}]\n${chunk.text}\n`;
      });
      contextText += '\n--- Конец блока ---\n';
    } else if (!chartInterpretationBlock && !atmakarakaBlock && !predictionBlock && !namedSectionHints.trim()) {
      contextText =
        '\n\n--- Релевантные чанки векторного поиска пусты, именованные блоки не переданы. См. п. 0 и блоки «Статус области» (если есть). ---\n';
    }

    const userTurnsInTopic = messageHistory.filter((m) => m.role === 'user').length;
    const personalityAlgoEnabled = await getPersonalityReadingAlgorithmEnabled();
    const runPersonalityAlgo =
      personalityAlgoEnabled &&
      activeChart &&
      shouldRunPersonalityReadingAlgorithm(message, userTurnsInTopic);

    let personalityReadingBlock = '';
    if (runPersonalityAlgo && activeChart) {
      phase = 'personality_algo';
      const alreadyUsedChunkTexts = new Set<string>();
      for (const ch of chartInterpretationChunks) {
        if (ch.text) alreadyUsedChunkTexts.add(ch.text);
      }
      for (const ch of atmakarakaChunks) {
        if (ch.text) alreadyUsedChunkTexts.add(ch.text);
      }
      for (const ch of predictionChunks) {
        if (ch.text) alreadyUsedChunkTexts.add(ch.text);
      }
      for (const ch of relevantChunks) {
        if (ch.text) alreadyUsedChunkTexts.add(ch.text);
      }
      personalityReadingBlock = await buildPersonalityReadingAlgorithmBlock({
        userMessage: message,
        chart: activeChart,
        userMessageCountInTopic: userTurnsInTopic,
        alreadyUsedChunkTexts,
      });
    }

    // Формируем системный промпт: память + другие диалоги + резюме + данные пользователя и карты + блок трактовки карты + остальные области памяти
    const systemMessage = {
      role: 'system' as const,
      content:
        getPromptServerNowBlock()
        + SYSTEM_PROMPT
        + userMemoryBlock
        + otherTopicsBlock
        + topicSummaryBlock
        + (userContext ? `\n\n--- Данные пользователя и натальная карта (всегда смотри сюда для вопросов о пользователе; расшифровывай по правилам из блока ниже) ---\n${userContext}\n--- Конец данных пользователя ---` : '')
        + chartInterpretationBlock
        + predictionBlock
        + computedTransitBlock
        + atmakarakaBlock
        + personalityReadingBlock
        + comparisonBlock
        + styleContext
        + namedSectionHints
        + (contextText ? contextText : ''),
    };

    // История уже включает текущее сообщение пользователя (последние до 25 сообщений)
    const messages = [systemMessage, ...messageHistory];

    phase = 'openai';
    let response = '';
    const chatModel = getOpenAiChatModel();
    try {
      const createCompletion = async (requestMessages: any[]) =>
        openai.chat.completions.create({
          model: chatModel,
          messages: requestMessages,
          max_completion_tokens: 1800,
        });

      let completion;
      try {
        completion = await createCompletion(messages as any);
      } catch {
        // Иногда первая попытка падает транзиентно, повтор проходит.
        completion = await createCompletion(messages as any);
      }

      response = completion.choices?.[0]?.message?.content || '';
      const finishReason = completion.choices?.[0]?.finish_reason;
      if (finishReason === 'length' && response) {
        const continueCompletion = await createCompletion([
          ...(messages as any),
          { role: 'assistant', content: response },
          { role: 'user', content: 'Продолжи ответ с места остановки, без повторов.' },
        ]);
        const continuation = continueCompletion.choices?.[0]?.message?.content || '';
        if (continuation) response = `${response}\n\n${continuation}`.trim();
      }
      if (!response) {
        response = 'Извините, не удалось получить ответ. Повторите запрос, пожалуйста.';
      }
      console.log('AI answer metadata:', {
        userId,
        topicId: topic.id,
        model: chatModel,
        usedChart: !!activeChart,
        isAtmakarakaQuery,
        isPredictionQuery,
        chartInterpretationChunks: chartInterpretationChunks.length,
        predictionChunks: predictionChunks.length,
        atmakarakaChunks: atmakarakaChunks.length,
        otherMemoryChunks: relevantChunks.length - chartInterpretationChunks.length,
        hasUserMemory: !!userMemoryRow?.facts?.trim(),
        otherTopicsCount: otherTopicsFiltered.length,
        hasTopicSummary: !!topicSummary,
        personalityReadingAlgorithm: !!personalityReadingBlock,
      });
    } catch (openaiError: any) {
      console.error('OpenAI API error:', openaiError);
      response = 'Извините, произошла ошибка при обработке запроса. Попробуйте позже.';

      if (openaiError.message) {
        console.error('Error details:', openaiError.message);
      }
      alertOpenAiFailure('chat/message', openaiError, {
        userId,
        topicId: topic.id,
        model: chatModel,
      });
    }

    phase = 'save_assistant_message';
    const assistantMessage = await Message.create({
      topicId: topic.id,
      role: 'assistant',
      content: response,
    });

    if (planBefore.code === 'free') {
      await consumeFreeAiRequest(currentUser);
    }

    const sectionRefsMap = new Map<string, string>();
    relevantChunks.forEach((chunk) => {
      if (chunk.sectionId && !sectionRefsMap.has(chunk.sectionId)) {
        sectionRefsMap.set(chunk.sectionId, chunk.sectionName || chunk.sectionId);
      }
    });
    const sectionRefs = Array.from(sectionRefsMap.entries()).map(([id, name]) => ({ id, name }));

    // Не блокируем ответ клиенту: второй вызов GPT (extractUserFacts) и логи — в фоне
    void runChatMessagePostProcess({
      userId,
      topicId: topic.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      userMessageContent: userMessage.content,
      assistantContent: response,
      sectionRefs,
    }).catch((postErr) => {
      console.warn('[chat/message] post-process failed:', postErr);
    });

    console.log('[chat/message] OK', {
      userId,
      topicId: topic.id,
      assistantMessageId: assistantMessage.id,
    });

    return NextResponse.json({
      response,
      topicId: topic.id,
    });
  } catch (error: any) {
    const errMessage = error?.message || String(error);
    const sqlParent = error?.parent as { sqlMessage?: string; sql?: string } | undefined;
    console.error(
      '[chat/message] FAILED',
      JSON.stringify({
        phase,
        userId: logUserId,
        topicId: logTopicId,
        err: errMessage,
        code: error?.code,
        name: error?.name,
        sqlMessage: sqlParent?.sqlMessage,
      })
    );
    if (error?.stack) console.error('[chat/message] stack:', error.stack);
    alertAdminAsync({
      source: 'chat/message',
      severity: 'critical',
      title: 'Чат: необработанная ошибка (500)',
      detail: `phase=${phase}`,
      meta: {
        userId: logUserId,
        topicId: logTopicId,
        code: error?.code || null,
      },
      error,
      dedupeMs: 10 * 60 * 1000,
    });
    const debug = process.env.CHAT_ERROR_DEBUG === '1' || process.env.CHAT_ERROR_DEBUG === 'true';
    return NextResponse.json(
      {
        error: 'Произошла ошибка при отправке сообщения',
        ...(debug ? { detail: `${phase}: ${errMessage}` } : {}),
      },
      { status: 500 }
    );
  }
}

async function runChatMessagePostProcess(payload: {
  userId: number;
  topicId: number;
  userMessageId: number;
  assistantMessageId: number;
  userMessageContent: string;
  assistantContent: string;
  sectionRefs: { id: string; name: string }[];
}): Promise<void> {
  try {
    await ChatRequestLog.create({
      userId: payload.userId,
      topicId: payload.topicId,
      userMessageId: payload.userMessageId,
      assistantMessageId: payload.assistantMessageId,
      sectionRefs: payload.sectionRefs,
    });
  } catch (logErr) {
    console.warn('ChatRequestLog.create failed (chat still ok):', logErr);
  }

  try {
    await ChatTopic.update({ updatedAt: new Date() }, { where: { id: payload.topicId } });
  } catch (topicErr) {
    console.warn('ChatTopic.update failed:', topicErr);
  }

  try {
    const newFacts = await extractUserFacts(payload.userMessageContent, payload.assistantContent);
    if (newFacts.length > 0) await appendUserMemory(payload.userId, newFacts);
  } catch (memErr) {
    console.warn('User memory update failed:', memErr);
  }
}

