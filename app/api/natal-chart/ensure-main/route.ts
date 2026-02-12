import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { initDatabase } from '@/lib/initDb';
import UserAnketa from '@/models/UserAnketa';
import NatalChart from '@/models/NatalChart';
import { getCityCoordinates } from '@/lib/geocoding';
import { calculateNatalChart, BirthData } from '@/lib/natal-chart-calculator';

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

/** Создаёт основную натальную карту по анкете, если её ещё нет. Возвращает { created: boolean }. */
export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const existingMain = await NatalChart.findOne({
      where: { userId, isMain: true },
    });
    if (existingMain) {
      return NextResponse.json({ created: false });
    }

    const anketa = await UserAnketa.findOne({ where: { userId } });
    if (!anketa || !anketa.birthCity || !anketa.birthDate || !anketa.birthTime) {
      return NextResponse.json(
        { error: 'Анкета не заполнена. Заполните дату рождения, время и город рождения в анкете.' },
        { status: 400 }
      );
    }

    const birthDateParts = anketa.birthDate.split('-');
    if (birthDateParts.length !== 3) {
      return NextResponse.json(
        { error: 'Неверный формат даты рождения в анкете.' },
        { status: 400 }
      );
    }
    const year = parseInt(birthDateParts[0], 10);
    const month = parseInt(birthDateParts[1], 10);
    const day = parseInt(birthDateParts[2], 10);

    const birthTimeParts = anketa.birthTime.split(':');
    if (birthTimeParts.length < 2) {
      return NextResponse.json(
        { error: 'Неверный формат времени рождения в анкете.' },
        { status: 400 }
      );
    }
    const finalHour = parseInt(birthTimeParts[0], 10);
    const finalMinute = parseInt(birthTimeParts[1], 10);
    const finalSecond = birthTimeParts.length > 2 ? parseInt(birthTimeParts[2], 10) : 0;

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(finalHour) || isNaN(finalMinute)) {
      return NextResponse.json(
        { error: 'Неверные данные даты или времени рождения в анкете.' },
        { status: 400 }
      );
    }

    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    const chartName = anketa.name || `${monthNames[month - 1]} ${year}`;
    const chartDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const chartTime = `${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}${finalSecond > 0 ? `:${String(finalSecond).padStart(2, '0')}` : ''}`;

    let lat: number, lon: number, timezone: number;
    try {
      const coords = await getCityCoordinates(anketa.birthCity);
      lat = coords.lat;
      lon = coords.lon;
      timezone = coords.timezone;
    } catch (geocodingError: any) {
      return NextResponse.json(
        { error: geocodingError.message || 'Не удалось найти координаты города.' },
        { status: 400 }
      );
    }

    const birthData: BirthData = {
      year, month, day,
      hour: finalHour,
      minute: finalMinute,
      latitude: lat,
      longitude: lon,
      timezone,
    };

    const chartData = await calculateNatalChart(birthData);

    await NatalChart.create({
      userId,
      name: chartName,
      chartDate,
      chartTime,
      chartCity: anketa.birthCity,
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
      isMain: true,
      calculatedAt: new Date(),
    });

    return NextResponse.json({ created: true });
  } catch (error: any) {
    console.error('Ensure main natal chart error:', error);
    return NextResponse.json(
      { error: error.message || 'Ошибка при создании основной натальной карты' },
      { status: 500 }
    );
  }
}
