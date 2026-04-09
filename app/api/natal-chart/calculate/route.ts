import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { initDatabase } from '@/lib/initDb';
import UserAnketa from '@/models/UserAnketa';
import NatalChart from '@/models/NatalChart';
import User from '@/models/User';
import { getCityCoordinates } from '@/lib/geocoding';
import { getHistoricalTimezoneOffset } from '@/lib/historical-timezone';
import { calculateNatalChart, BirthData } from '@/lib/natal-chart-calculator';
import { canCreateMoreCharts, ensureFreePlanWindow, getFrozenChartIdsForPlan, getUserPlanSnapshot } from '@/lib/subscription';

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

    const user = await User.findByPk(userId);
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }
    await ensureFreePlanWindow(user);
    const plan = getUserPlanSnapshot(user);
    const existingCustomChartsCount = await NatalChart.count({ where: { userId, isMain: false } });
    if (!canCreateMoreCharts(plan, existingCustomChartsCount)) {
      return NextResponse.json(
        { error: 'Лимит карт по вашему тарифу исчерпан. Выберите другой тариф, чтобы создавать больше карт.' },
        { status: 403 }
      );
    }
    if (plan.code === 'free') {
      return NextResponse.json(
        { error: 'На бесплатном тарифе нельзя создавать дополнительные карты.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const customBirthDate = typeof body.birthDate === 'string' ? body.birthDate.trim() : '';
    const customBirthTime = typeof body.birthTime === 'string' ? body.birthTime.trim() : '';
    const customBirthCity = typeof body.birthPlace === 'string' ? body.birthPlace.trim() : '';
    const customName = typeof body.name === 'string' ? body.name.trim() : '';
    const hasCustomPayload = !!(customBirthDate && customBirthTime && customBirthCity);

    // Получаем данные из анкеты (fallback)
    const anketa = hasCustomPayload ? null : await UserAnketa.findOne({ where: { userId } });
    if (!hasCustomPayload && (!anketa || !anketa.birthCity || !anketa.birthDate || !anketa.birthTime)) {
      return NextResponse.json(
        { error: 'Анкета не заполнена. Заполните дату рождения, время и город рождения в анкете.' },
        { status: 400 }
      );
    }

    const birthDateRaw = hasCustomPayload ? customBirthDate : String(anketa!.birthDate);
    const birthTimeRaw = hasCustomPayload ? customBirthTime : String(anketa!.birthTime);
    const birthCityRaw = hasCustomPayload ? customBirthCity : String(anketa!.birthCity);

    // Парсим дату рождения из анкеты (формат: YYYY-MM-DD)
    const birthDateParts = birthDateRaw.split('-');
    if (birthDateParts.length !== 3) {
      return NextResponse.json(
        { error: 'Неверный формат даты рождения в анкете. Ожидается формат YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    const year = parseInt(birthDateParts[0], 10);
    const month = parseInt(birthDateParts[1], 10);
    const day = parseInt(birthDateParts[2], 10);

    // Парсим время рождения из анкеты (формат: HH:MM или HH:MM:SS)
    const birthTimeParts = birthTimeRaw.split(':');
    if (birthTimeParts.length < 2) {
      return NextResponse.json(
        { error: 'Неверный формат времени рождения в анкете. Ожидается формат HH:MM.' },
        { status: 400 }
      );
    }

    const finalHour = parseInt(birthTimeParts[0], 10);
    const finalMinute = parseInt(birthTimeParts[1], 10);
    const finalSecond = birthTimeParts.length > 2 ? parseInt(birthTimeParts[2], 10) : 0;

    // Валидация данных
    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(finalHour) || isNaN(finalMinute)) {
      return NextResponse.json(
        { error: 'Неверные данные даты или времени рождения в анкете.' },
        { status: 400 }
      );
    }

    // Формируем название карты: используем имя из анкеты или дату рождения
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    const chartName = customName || (anketa?.name || `${monthNames[month - 1]} ${year}`);
    
    const chartDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const chartTime = `${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}${finalSecond > 0 ? `:${String(finalSecond).padStart(2, '0')}` : ''}`;

    let lat: number, lon: number, timezone: number;

    try {
      const coords = await getCityCoordinates(birthCityRaw);
      lat = coords.lat;
      lon = coords.lon;
      const historicalOffset = getHistoricalTimezoneOffset(
        lat,
        lon,
        year,
        month,
        day,
        finalHour,
        finalMinute
      );
      timezone = historicalOffset ?? coords.timezone;
    } catch (geocodingError: any) {
      console.error('Ошибка геокодинга:', geocodingError);
      return NextResponse.json(
        { 
          error: geocodingError.message || 'Не удалось найти координаты города. Проверьте правильность написания названия города в анкете.',
          suggestion: 'Попробуйте указать город в формате "Город, Россия" или проверьте правильность написания'
        },
        { status: 400 }
      );
    }

    // Рассчитываем натальную карту
    const birthData: BirthData = {
      year,
      month,
      day,
      hour: finalHour,
      minute: finalMinute,
      latitude: lat,
      longitude: lon,
      timezone
    };

    const chartData = await calculateNatalChart(birthData);

    // Сохраняем в базу данных
    const natalChart = await NatalChart.create({
      userId,
      name: chartName,
      chartDate,
      chartTime,
      chartCity: birthCityRaw,
      chartLatitude: lat,
      chartLongitude: lon,
      timezone,
      julianDay: chartData.julianDay,
      sun: chartData.planets.sun.longitude,
      moon: chartData.planets.moon.longitude,
      mercury: chartData.planets.mercury.longitude,
      venus: chartData.planets.venus.longitude,
      mars: chartData.planets.mars.longitude,
      jupiter: chartData.planets.jupiter.longitude,
      saturn: chartData.planets.saturn.longitude,
      uranus: chartData.planets.uranus.longitude,
      neptune: chartData.planets.neptune.longitude,
      pluto: chartData.planets.pluto.longitude,
      northNode: chartData.planets.northNode.longitude,
      southNode: chartData.planets.southNode.longitude,
      ascendant: chartData.houses.ascendant.longitude,
      midheaven: chartData.houses.midheaven.longitude,
      house1: chartData.houses.house1.longitude,
      house2: chartData.houses.house2.longitude,
      house3: chartData.houses.house3.longitude,
      house4: chartData.houses.house4.longitude,
      house5: chartData.houses.house5.longitude,
      house6: chartData.houses.house6.longitude,
      house7: chartData.houses.house7.longitude,
      house8: chartData.houses.house8.longitude,
      house9: chartData.houses.house9.longitude,
      house10: chartData.houses.house10.longitude,
      house11: chartData.houses.house11.longitude,
      house12: chartData.houses.house12.longitude,
      houseSystem: chartData.houseSystem,
      siderealTime: chartData.siderealTime,
      isMain: false,
      createdByAdmin: false,
      calculatedAt: new Date()
    });

    return NextResponse.json({
      success: true,
      chart: natalChart,
      chartData: {
        ...chartData,
        navamsha: chartData.navamsha,
        dashas: chartData.dashas,
      } // Полные данные для отображения включая навамшу и даши
    });
  } catch (error: any) {
    console.error('Calculate natal chart error:', error);
    return NextResponse.json(
      { error: error.message || 'Ошибка при расчете натальной карты' },
      { status: 500 }
    );
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

    const user = await User.findByPk(userId);
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }
    await ensureFreePlanWindow(user);
    const planCode = getUserPlanSnapshot(user).code;
    // Получаем все карты пользователя, отсортированные по дате создания
    const charts = await NatalChart.findAll({ 
      where: { userId },
      order: [['createdAt', 'DESC']]
    });
    const frozenIds = getFrozenChartIdsForPlan(planCode, charts as any);
    
    return NextResponse.json({
      charts: (charts || []).map((chart: any) => ({
        ...chart.toJSON(),
        isFrozen: frozenIds.has(chart.id),
      }))
    });
  } catch (error: any) {
    console.error('Get natal charts error:', error);
    return NextResponse.json(
      { error: 'Ошибка при получении натальных карт' },
      { status: 500 }
    );
  }
}
