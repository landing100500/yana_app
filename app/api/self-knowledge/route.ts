import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { initDatabase } from '@/lib/initDb';
import NatalChart from '@/models/NatalChart';
import { openai } from '@/lib/openai';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'yasna-secret-key-change-in-production';
const SYSTEM_PROMPT = 'Ты умный агент по астропсихологии';

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

// Функция для определения управителя знака (Лагнеша)
function getSignRuler(sign: number): string {
  const rulers: Record<number, string> = {
    0: 'Марс',     // Овен
    1: 'Венера',   // Телец
    2: 'Меркурий', // Близнецы
    3: 'Луна',     // Рак
    4: 'Солнце',   // Лев
    5: 'Меркурий', // Дева
    6: 'Венера',   // Весы
    7: 'Марс',     // Скорпион
    8: 'Юпитер',   // Стрелец
    9: 'Сатурн',   // Козерог
    10: 'Сатурн',  // Водолей
    11: 'Юпитер',  // Рыбы
  };
  return rulers[sign] || 'Неизвестно';
}

// Функция для получения названия знака
function getSignName(sign: number): string {
  const signs = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева', 'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];
  return signs[sign] || 'Неизвестно';
}

// Функция для определения знака из долготы
function longitudeToSign(longitude: number): number {
  let normalized = longitude % 360;
  if (normalized < 0) normalized += 360;
  return Math.floor(normalized / 30) % 12;
}

// Функция для определения накшатры (упрощенная версия)
function getNakshatra(longitude: number): string {
  // Накшатры занимают примерно 13.33 градуса каждая
  const nakshatraIndex = Math.floor((longitude % 360) / 13.333333);
  const nakshatras = [
    'Ашвини', 'Бхарани', 'Криттика', 'Рохини', 'Мригашира',
    'Ардра', 'Пушья', 'Ашлеша', 'Магха', 'Пурва Пхалгуни',
    'Уттара Пхалгуни', 'Хаста', 'Читра', 'Свати', 'Вишакха',
    'Анурадха', 'Джьештха', 'Мула', 'Пурва Ашадха', 'Уттара Ашадха',
    'Шравана', 'Дхаништха', 'Шатабхиша', 'Пурва Бхадрапада', 'Уттара Бхадрапада',
    'Ревати'
  ];
  return nakshatras[nakshatraIndex % 27] || 'Неизвестно';
}

// Функция для определения Атмакараки (планета с наибольшей долготой)
function getAtmakaraka(planets: {
  sun: number;
  moon: number;
  mercury: number;
  venus: number;
  mars: number;
  jupiter: number;
  saturn: number;
}): { planet: string; longitude: number } {
  const planetData = [
    { name: 'Солнце', value: planets.sun },
    { name: 'Луна', value: planets.moon },
    { name: 'Меркурий', value: planets.mercury },
    { name: 'Венера', value: planets.venus },
    { name: 'Марс', value: planets.mars },
    { name: 'Юпитер', value: planets.jupiter },
    { name: 'Сатурн', value: planets.saturn },
  ];

  const maxPlanet = planetData.reduce((max, planet) => 
    planet.value > max.value ? planet : max
  );

  return { planet: maxPlanet.name, longitude: maxPlanet.value };
}

// Функция для определения Аматьякараки (планета со второй по величине долготой)
function getAmatyakaraka(planets: {
  sun: number;
  moon: number;
  mercury: number;
  venus: number;
  mars: number;
  jupiter: number;
  saturn: number;
}): { planet: string; longitude: number } {
  const planetData = [
    { name: 'Солнце', value: planets.sun },
    { name: 'Луна', value: planets.moon },
    { name: 'Меркурий', value: planets.mercury },
    { name: 'Венера', value: planets.venus },
    { name: 'Марс', value: planets.mars },
    { name: 'Юпитер', value: planets.jupiter },
    { name: 'Сатурн', value: planets.saturn },
  ];

  const sorted = planetData.sort((a, b) => b.value - a.value);
  return { planet: sorted[1].name, longitude: sorted[1].value };
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

    // Получаем последнюю натальную карту пользователя
    const lastChart = await NatalChart.findOne({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });

    if (!lastChart) {
      return NextResponse.json(
        { error: 'Для использования этого функционала необходимо создать хотя бы одну натальную карту. Пожалуйста, создайте натальную карту на странице "Натальные карты".' },
        { status: 400 }
      );
    }

    // Преобразуем данные в числа (могут прийти как строки из БД)
    const ascendant = Number(lastChart.ascendant);
    const sun = Number(lastChart.sun);
    const moon = Number(lastChart.moon);
    const mercury = Number(lastChart.mercury);
    const venus = Number(lastChart.venus);
    const mars = Number(lastChart.mars);
    const jupiter = Number(lastChart.jupiter);
    const saturn = Number(lastChart.saturn);
    const northNode = Number(lastChart.northNode);
    const southNode = Number(lastChart.southNode);
    const house1 = Number(lastChart.house1);
    const house7 = Number(lastChart.house7);
    const house12 = Number(lastChart.house12);

    // Определяем параметры карты
    const ascendantSign = longitudeToSign(ascendant);
    const lagneSha = getSignRuler(ascendantSign);
    const ascendantNakshatra = getNakshatra(ascendant);
    const lagneShaNakshatra = getNakshatra(ascendant); // Упрощенно, используем асцендент
    
    const atmakaraka = getAtmakaraka({
      sun,
      moon,
      mercury,
      venus,
      mars,
      jupiter,
      saturn,
    });

    const amatyakaraka = getAmatyakaraka({
      sun,
      moon,
      mercury,
      venus,
      mars,
      jupiter,
      saturn,
    });

    const marsNakshatra = getNakshatra(mars);
    const rahuSign = longitudeToSign(northNode);
    const ketuSign = longitudeToSign(southNode);

    // Формируем данные карты для промпта
    const sunSign = longitudeToSign(lastChart.sun);
    const moonSign = longitudeToSign(lastChart.moon);
    const mercurySign = longitudeToSign(lastChart.mercury);
    const venusSign = longitudeToSign(lastChart.venus);
    const marsSign = longitudeToSign(lastChart.mars);
    const jupiterSign = longitudeToSign(lastChart.jupiter);
    const saturnSign = longitudeToSign(lastChart.saturn);
    const atmakarakaSign = longitudeToSign(atmakaraka.longitude);
    const amatyakarakaSign = longitudeToSign(amatyakaraka.longitude);

    const chartData = {
      date: lastChart.chartDate,
      time: lastChart.chartTime,
      city: lastChart.chartCity,
      ascendant: {
        longitude: ascendant,
        sign: getSignName(ascendantSign),
        nakshatra: ascendantNakshatra,
        ruler: lagneSha,
      },
      planets: {
        sun: { longitude: sun, sign: getSignName(sunSign) },
        moon: { longitude: moon, sign: getSignName(moonSign) },
        mercury: { longitude: mercury, sign: getSignName(mercurySign) },
        venus: { longitude: venus, sign: getSignName(venusSign) },
        mars: { longitude: mars, sign: getSignName(marsSign), nakshatra: marsNakshatra },
        jupiter: { longitude: jupiter, sign: getSignName(jupiterSign) },
        saturn: { longitude: saturn, sign: getSignName(saturnSign) },
        rahu: { longitude: northNode, sign: getSignName(rahuSign) },
        ketu: { longitude: southNode, sign: getSignName(ketuSign) },
      },
      atmakaraka: {
        planet: atmakaraka.planet,
        longitude: atmakaraka.longitude,
        sign: getSignName(atmakarakaSign),
      },
      amatyakaraka: {
        planet: amatyakaraka.planet,
        longitude: amatyakaraka.longitude,
        sign: getSignName(amatyakarakaSign),
      },
      houses: {
        house1: house1,
        house7: house7,
        house12: house12,
      },
    };

    // Формируем промпт с вопросами
    const questions = `
1. Кто я на самом деле, если убрать все роли, ожидания и страхи? (описание по Лагнеше - ${lagneSha}, знак асцендента: ${chartData.ascendant.sign}, накшатра: ${ascendantNakshatra})

2. Какой главный смысл моей жизни в этом воплощении? (смотрим по Раху в Д1: Раху в знаке ${chartData.planets.rahu.sign}, долгота: ${chartData.planets.rahu.longitude.toFixed(2)}° и Лунной карте: Луна в знаке ${chartData.planets.moon.sign}, долгота: ${chartData.planets.moon.longitude.toFixed(2)}°)

3. В чём моя уникальность, которую я до сих пор недооценивала? (накшатра асцендента: ${ascendantNakshatra} + накшатра Лагнеши: ${lagneShaNakshatra})

4. Через какие качества моя душа хочет проявляться в этом мире? (Атмакарака: ${atmakaraka.planet}, в знаке ${chartData.atmakaraka.sign}, долгота: ${atmakaraka.longitude.toFixed(2)}°)

5. Какой мой жизненный сценарий пора закончить? (Кету в знаке ${chartData.planets.ketu.sign}, долгота: ${chartData.planets.ketu.longitude.toFixed(2)}°)

6. Какую главную ошибку я совершаю, пытаясь «быть не собой»? (Аматья карака: ${amatyakaraka.planet}, в знаке ${chartData.amatyakaraka.sign}, долгота: ${amatyakaraka.longitude.toFixed(2)}°)

7. Почему мне кажется, что я живу не на полную силу? (накшатра Марса: ${marsNakshatra}, Марс в знаке ${chartData.planets.mars.sign}, долгота: ${chartData.planets.mars.longitude.toFixed(2)}°)

8. Что моя душа давно пытается мне сказать, но я не слышу? (Атмакарака: ${atmakaraka.planet}, в знаке ${chartData.atmakaraka.sign})

9. В каком жизненном периоде я нахожусь прямо сейчас? (Вимшоттари даша - требуется расчет на основе текущей даты и времени карты: ${lastChart.chartDate} ${lastChart.chartTime})

10. Для каких моих действий сейчас идеальное время? (Транзит Солнца по Лунной карте - требуется расчет транзитов на текущую дату)

11. Почему сейчас так много сомнений / усталости / тревоги? (Период Сатурна - требуется расчет Вимшоттари даши)

12. Что я должна перестать делать, чтобы не идти против своей судьбы? (идти по Кету, а надо по Раху. Кету: ${chartData.planets.ketu.longitude.toFixed(2)}°, Раху: ${chartData.planets.rahu.longitude.toFixed(2)}°)

13. Какой урок я проживаю в этом году? (транзит Сатурна и Юпитера - требуется расчет транзитов на текущую дату)

14. Что в моей жизни сейчас завершает цикл? (транзиты по 12 дому в Лунной карте и в Д1 - требуется расчет транзитов)

15. Что, наоборот, только начинает раскрываться? (транзиты по 1 и 7 дому - требуется расчет транзитов)

16. Почему мне кажется, что я «застряла», и правда ли это? (планета Вимшоттари Даши, период и подпериод - требуется расчет на основе текущей даты)
`;

    const userPrompt = `
На основе натальной карты пользователя ответь на следующие вопросы о базовом самопознании. 

Данные натальной карты:
- Дата и время: ${lastChart.chartDate} ${lastChart.chartTime}
- Место: ${lastChart.chartCity}
- Асцендент: ${chartData.ascendant.sign} (${chartData.ascendant.longitude.toFixed(2)}°), накшатра: ${ascendantNakshatra}, управитель (Лагнеша): ${lagneSha}
- Планеты:
  * Солнце: ${chartData.planets.sun.longitude.toFixed(2)}° в знаке ${chartData.planets.sun.sign}
  * Луна: ${chartData.planets.moon.longitude.toFixed(2)}° в знаке ${chartData.planets.moon.sign}
  * Меркурий: ${chartData.planets.mercury.longitude.toFixed(2)}° в знаке ${chartData.planets.mercury.sign}
  * Венера: ${chartData.planets.venus.longitude.toFixed(2)}° в знаке ${chartData.planets.venus.sign}
  * Марс: ${chartData.planets.mars.longitude.toFixed(2)}° в знаке ${chartData.planets.mars.sign}, накшатра: ${marsNakshatra}
  * Юпитер: ${chartData.planets.jupiter.longitude.toFixed(2)}° в знаке ${chartData.planets.jupiter.sign}
  * Сатурн: ${chartData.planets.saturn.longitude.toFixed(2)}° в знаке ${chartData.planets.saturn.sign}
  * Раху (Северный узел): ${chartData.planets.rahu.longitude.toFixed(2)}° в знаке ${chartData.planets.rahu.sign}
  * Кету (Южный узел): ${chartData.planets.ketu.longitude.toFixed(2)}° в знаке ${chartData.planets.ketu.sign}
- Атмакарака: ${atmakaraka.planet} (${atmakaraka.longitude.toFixed(2)}°) в знаке ${chartData.atmakaraka.sign}
- Аматьякарака: ${amatyakaraka.planet} (${amatyakaraka.longitude.toFixed(2)}°) в знаке ${chartData.amatyakaraka.sign}
- Дома: 1 дом (${chartData.houses.house1.toFixed(2)}°), 7 дом (${chartData.houses.house7.toFixed(2)}°), 12 дом (${chartData.houses.house12.toFixed(2)}°)

Вопросы для анализа:
${questions}

Ответь на каждый вопрос подробно и глубоко, используя знания ведической астрологии и астропсихологии. 

ВАЖНО: Форматируй ответ следующим образом:
- Каждый вопрос начинай с номера и текста вопроса в формате: **1. Текст вопроса**
- Ответ на вопрос размещай на следующей строке после вопроса
- Между вопросами с ответами оставляй пустую строку для визуального разделения

Пример формата:
**1. Кто я на самом деле?**
[Твой подробный ответ на этот вопрос]

**2. Какой главный смысл моей жизни?**
[Твой подробный ответ на этот вопрос]

Если для некоторых вопросов требуется расчет транзитов или Вимшоттари даши, которые не были предоставлены, объясни это пользователю и дай общий ответ на основе имеющихся данных карты, объясняя что означают эти параметры в контексте вопроса.
`;

    // Создаем потоковый ответ
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.7,
            max_tokens: 4000,
            stream: true,
          });

          let fullResponse = '';

          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              fullResponse += content;
              controller.enqueue(new TextEncoder().encode(content));
            }
          }

          controller.close();
        } catch (openaiError: any) {
          console.error('OpenAI API error:', openaiError);
          const errorMessage = 'Извините, произошла ошибка при обработке запроса. Попробуйте позже.';
          controller.enqueue(new TextEncoder().encode(errorMessage));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Self-knowledge error:', error);
    return NextResponse.json(
      { error: error.message || 'Произошла ошибка при обработке запроса' },
      { status: 500 }
    );
  }
}
