import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initDatabase } from '@/lib/initDb';
import AdminNatalChart from '@/models/AdminNatalChart';
import { getCityCoordinates } from '@/lib/geocoding';
import { getHistoricalTimezoneOffset } from '@/lib/historical-timezone';
import { calculateNatalChart, BirthData } from '@/lib/natal-chart-calculator';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { name, birthDate, birthTime, birthPlace } = body as {
      name?: string;
      birthDate?: string;
      birthTime?: string;
      birthPlace?: string;
    };

    if (!name?.trim() || !birthDate?.trim() || !birthTime?.trim() || !birthPlace?.trim()) {
      return NextResponse.json(
        { error: 'Укажите имя, дату рождения, время и место рождения.' },
        { status: 400 }
      );
    }

    const birthDateParts = String(birthDate).trim().split('-');
    if (birthDateParts.length !== 3) {
      return NextResponse.json(
        { error: 'Неверный формат даты. Ожидается YYYY-MM-DD.' },
        { status: 400 }
      );
    }
    const year = parseInt(birthDateParts[0], 10);
    const month = parseInt(birthDateParts[1], 10);
    const day = parseInt(birthDateParts[2], 10);

    const birthTimeParts = String(birthTime).trim().split(':');
    if (birthTimeParts.length < 2) {
      return NextResponse.json(
        { error: 'Неверный формат времени. Ожидается HH:MM или HH:MM:SS.' },
        { status: 400 }
      );
    }
    const hour = parseInt(birthTimeParts[0], 10);
    const minute = parseInt(birthTimeParts[1], 10);
    const second = birthTimeParts.length > 2 ? parseInt(birthTimeParts[2], 10) : 0;

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) {
      return NextResponse.json(
        { error: 'Неверные числовые значения даты или времени.' },
        { status: 400 }
      );
    }

    const chartDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const chartTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}${second > 0 ? `:${String(second).padStart(2, '0')}` : ''}`;

    let lat: number, lon: number, timezone: number;
    try {
      const coords = await getCityCoordinates(birthPlace.trim());
      lat = coords.lat;
      lon = coords.lon;
      const historicalOffset = getHistoricalTimezoneOffset(lat, lon, year, month, day, hour, minute);
      timezone = historicalOffset ?? coords.timezone;
    } catch (geocodingError: any) {
      return NextResponse.json(
        {
          error: geocodingError.message || 'Не удалось найти координаты города.',
          suggestion: 'Укажите город в формате "Город, Страна".',
        },
        { status: 400 }
      );
    }

    const birthData: BirthData = {
      year,
      month,
      day,
      hour,
      minute,
      latitude: lat,
      longitude: lon,
      timezone,
    };

    const chartData = await calculateNatalChart(birthData);

    const chart = await AdminNatalChart.create({
      name: name.trim(),
      chartDate,
      chartTime,
      chartCity: birthPlace.trim(),
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
      calculatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      chart,
      message: 'Карта успешно рассчитана и сохранена.',
    });
  } catch (error: any) {
    console.error('Admin create natal chart error:', error);
    return NextResponse.json(
      { error: error.message || 'Ошибка при расчёте карты' },
      { status: 500 }
    );
  }
}
