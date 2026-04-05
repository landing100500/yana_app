import type NatalChart from '@/models/NatalChart';
import { getChunksFromSectionByName } from '@/lib/rag-search';

const SIGN_NAMES = [
  'Меша',
  'Вришабха',
  'Митхуна',
  'Карка',
  'Симха',
  'Канья',
  'Тула',
  'Вришчика',
  'Дхану',
  'Макара',
  'Кумбха',
  'Мина',
] as const;

function longitudeToSignName(lon: number): string {
  const n = ((lon % 360) + 360) % 360;
  return SIGN_NAMES[Math.floor(n / 30) % 12];
}

/** Имя области памяти для книги по асценденту (как в админке) */
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

const SECTION_INTERPRETATION = 'Интерпретация натальной карты';
const SECTION_CHART_PART1 = 'Как трактовать карту - 1 часть';
const SECTION_PLANET_STRENGTH = 'Сила и поражение планет';
const SECTION_51_OPORA = '51 опора';
const SECTION_12_HAPPINESS = '12 основ счастья через работы с подсознанием';
const SECTION_CHARAKARAKA_EXAMPLE = 'Пример расчета чаракарок';

const LOW_MOOD_RX =
  /депресс|подавлен|апати|нет\s+сил|не\s+хочу\s+жить|тоск|бессили|выгорел|выгорание|суицид|хочу\s+всё\s+бросить/i;

/** Запускать расширенный контекст только когда это уместно (не на каждое сообщение). */
export function shouldRunPersonalityReadingAlgorithm(message: string, userMessageCountInTopic: number): boolean {
  const m = message.trim();
  if (m.length < 2) return false;
  if (
    /личност|характер|кто\s+я|о\s+себе|психотип|расскажи\s+обо\s+мне|что\s+ты\s+обо\s+мне|что\s+особенн.*карт|мо(я|ё)\s+карт/i.test(
      m
    )
  ) {
    return true;
  }
  if (
    /предназначен|накшатр|практик|обид|претензи|чувств.*вин|долг(ов)?|счасть|сексуальн|чаракарк|сфер/i.test(m)
  ) {
    return true;
  }
  if (/подавлен|депресс|апати|нет\s+сил/i.test(m)) return true;
  if (userMessageCountInTopic <= 2) return true;
  if (/натальн|асцендент|планет|дом[ае]?\s|транзит|атмакарак|карта\s/i.test(m)) return true;
  return false;
}

export function userMessageLooksLowMood(message: string): boolean {
  return LOW_MOOD_RX.test(message.trim());
}

function planetContextLine(chart: NatalChart): string {
  const s = longitudeToSignName;
  return [
    `Солнце ${s(chart.sun)}, Луна ${s(chart.moon)}, Меркурий ${s(chart.mercury)}, Венера ${s(chart.venus)}, Марс ${s(chart.mars)}, Юпитер ${s(chart.jupiter)}, Сатурн ${s(chart.saturn)}, Раху ${s(chart.northNode)}, Кету ${s(chart.southNode)}`,
  ].join('. ');
}

function appendChunks(
  out: string[],
  title: string,
  weightNote: string,
  chunks: Array<{ text: string; sectionName?: string }>,
  exclude: Set<string>,
  startIndex: number
): number {
  let idx = startIndex;
  const fresh = chunks.filter((c) => c.text && !exclude.has(c.text));
  fresh.forEach((c) => exclude.add(c.text));
  if (fresh.length === 0) return idx;
  out.push(`\n### ${title} (ориентир веса в ответе: ~${weightNote})\n`);
  fresh.forEach((c) => {
    idx += 1;
    out.push(`\n[Фрагмент ${idx}${c.sectionName ? ` — ${c.sectionName}` : ''}]\n${c.text}\n`);
  });
  return idx;
}

export interface PersonalityReadingBuildParams {
  userMessage: string;
  chart: NatalChart;
  /** Сколько сообщений роли user уже в топике, включая текущее */
  userMessageCountInTopic: number;
  /** Тексты чанков, уже попавшие в системный промпт (чтобы не дублировать) */
  alreadyUsedChunkTexts: Set<string>;
}

/**
 * Дополнительный блок системного промпта: алгоритм считывания личности и выборка из указанных областей памяти.
 * Не вызывать, если флаг в админке выключен.
 */
export async function buildPersonalityReadingAlgorithmBlock(
  params: PersonalityReadingBuildParams
): Promise<string> {
  const { userMessage, chart, userMessageCountInTopic, alreadyUsedChunkTexts } = params;
  const exclude = new Set(alreadyUsedChunkTexts);

  const ascSign = longitudeToSignName(chart.ascendant);
  const ascBookSection = ASCENDANT_BOOK_SECTION[ascSign] || `${ascSign} книга`;

  const planetCtx = planetContextLine(chart);
  const qBase = `${userMessage}\n\nКонтекст карты: асцендент ${ascSign}. ${planetCtx}`;

  const [
    ascChunks,
    interpChunks,
    chartPartChunks,
    strengthChunks,
    oporaChunks,
    happinessChunks,
    planetSphereChunks,
    charakarakaChunks,
  ] = await Promise.all([
    getChunksFromSectionByName(ascBookSection, `${userMessage} тип характера асцендент ${ascSign}`, 3),
    getChunksFromSectionByName(SECTION_INTERPRETATION, qBase, 3),
    getChunksFromSectionByName(SECTION_CHART_PART1, qBase, 4),
    getChunksFromSectionByName(SECTION_PLANET_STRENGTH, `${userMessage} сила поражение планет ${planetCtx}`, 3),
    getChunksFromSectionByName(SECTION_51_OPORA, `${userMessage} накшатры сферы практики`, 6),
    getChunksFromSectionByName(SECTION_12_HAPPINESS, `${userMessage} проработка обид вины долги предназначение практики подсознание`, 6),
    getChunksFromSectionByName(
      SECTION_INTERPRETATION,
      `${userMessage} сфера интересов планеты Венера Раху Кету Сатурн Меркурий Юпитер Солнце Луна Марс ${planetCtx}`,
      6
    ),
    userMessageCountInTopic <= 2
      ? getChunksFromSectionByName(SECTION_CHARAKARAKA_EXAMPLE, `${userMessage} чаракарки расчёт`, 3)
      : Promise.resolve([]),
  ]);

  const header: string[] = [
    '\n\n--- Алгоритм считывания личности человека (включён администратором; используй вместе с базовыми правилами агента) ---\n',
    'Когда отвечаешь на этот запрос пользователя, структурируй опору на материалах ниже с такими ориентирами по «весу» смысла в ответе:',
    '1) ~5% — тип характера по асценденту: область памяти с книгой по знаку асцендента (фрагменты ниже).',
    '2) ~5% — алгоритмы и смыслы из «Интерпретация натальной карты».',
    '3) ~10% — трактовка по «Как трактовать карту - 1 часть».',
    '4) ~5% — «Сила и поражение планет» для анализа карты.',
    '5) ~20% — «51 опора»: накшатры по сферам интереса пользователя, практики по накшатрам, управляющим нужной сферой.',
    '6) ~20% — «12 основ счастья через работы с подсознанием»: жизненные примеры и практики (обиды, претензии, вина, предназначение, долги и т.п.).',
    '7) ~20% — сфера запроса пользователя через планеты (Венера, Раху, Кету, Сатурн, Меркурий, Юпитер, Солнце, Луна, Марс) с учётом их положений в карте; опирайся на переданные данные карты и фрагменты памяти.',
  ];

  if (userMessageLooksLowMood(userMessage)) {
    header.push(
      '8) ~10% — если уместно: пользователь звучит подавленно; мягко предложи узнать свой сексуальный сценарий (без давления), при необходимости опираясь на области памяти.'
    );
  } else {
    header.push(
      '8) Признаки сильного подавления в сообщении пользователя: при появлении мягко предложи узнать свой сексуальный сценарий.'
    );
  }

  if (charakarakaChunks.length > 0) {
    header.push(
      '9) ~5% — в начале диалога используй «Пример расчета чаракарок» для ответов на стартовые вопросы (фрагменты ниже).'
    );
  }

  header.push(
    'Соблюдай базовые жёсткие правила агента: астрологические выводы по карте — только из подключённых областей памяти и данных карты. Не выдумывай то, чего нет во фрагментах.',
    '--- Ниже фрагменты по шагам алгоритма ---\n'
  );

  const body: string[] = [];
  let n = 0;

  n = appendChunks(
    body,
    `Шаг 1. Асцендент ${ascSign} — «${ascBookSection}»`,
    '5%',
    ascChunks,
    exclude,
    n
  );
  n = appendChunks(body, 'Шаг 2. Интерпретация натальной карты', '5%', interpChunks, exclude, n);
  n = appendChunks(body, 'Шаг 3. Как трактовать карту — часть 1', '10%', chartPartChunks, exclude, n);
  n = appendChunks(body, 'Шаг 4. Сила и поражение планет', '5%', strengthChunks, exclude, n);
  n = appendChunks(body, 'Шаг 5. 51 опора (накшатры, практики по сферам)', '20%', oporaChunks, exclude, n);
  n = appendChunks(
    body,
    'Шаг 6. 12 основ счастья (подсознание, практики)',
    '20%',
    happinessChunks,
    exclude,
    n
  );
  n = appendChunks(
    body,
    'Шаг 7. Сфера запроса через планеты (Венера, Раху, Кету, Сатурн, Меркурий, Юпитер, Солнце, Луна, Марс)',
    '20%',
    planetSphereChunks,
    exclude,
    n
  );
  if (charakarakaChunks.length > 0) {
    n = appendChunks(body, 'Шаг 9. Пример расчета чаракарок (старт диалога)', '5%', charakarakaChunks, exclude, n);
  }

  if (body.length === 0) {
    return (
      header.join('\n') +
      '\n(Фрагменты из областей памяти не найдены или разделы не подключены к агенту — следуй алгоритму по весам, используя те блоки, что уже есть выше в системном сообщении.)\n--- Конец алгоритма считывания личности ---\n'
    );
  }

  return header.join('\n') + body.join('') + '\n--- Конец алгоритма считывания личности ---\n';
}
