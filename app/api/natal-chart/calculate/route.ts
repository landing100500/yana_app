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

    // Получаем данные из анкеты для координат города
    const anketa = await UserAnketa.findOne({ where: { userId } });
    if (!anketa || !anketa.birthCity) {
      return NextResponse.json(
        { error: 'Анкета не заполнена. Заполните город рождения в анкете.' },
        { status: 400 }
      );
    }

    // Используем ТЕКУЩЕЕ время для создания новой карты
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const finalHour = now.getHours();
    const finalMinute = now.getMinutes();
    const finalSecond = now.getSeconds();

    // Формируем название карты: "Январь 2025, 14:30:15"
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    const chartName = `${monthNames[month - 1]} ${year}, ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}:${String(finalSecond).padStart(2, '0')}`;
    
    const chartDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const chartTime = `${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}:${String(finalSecond).padStart(2, '0')}`;

    console.log('Создание новой карты с текущим временем:', {
      name: chartName,
      date: chartDate,
      time: chartTime
    });

    // Получаем координаты города из анкеты
    console.log('Получение координат города:', anketa.birthCity);
    let lat: number, lon: number, timezone: number;
    
    try {
      const coords = await getCityCoordinates(anketa.birthCity);
      lat = coords.lat;
      lon = coords.lon;
      timezone = coords.timezone;
      console.log('Координаты получены:', { lat, lon, timezone });
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

    console.log('Начало расчета натальной карты...');
    const chartData = await calculateNatalChart(birthData);
    console.log('Расчет завершен успешно');

    // Сохраняем в базу данных
    const natalChart = await NatalChart.create({
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
      calculatedAt: new Date()
    });

    return NextResponse.json({
      success: true,
      chart: natalChart,
      chartData // Полные данные для отображения
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

    // Получаем все карты пользователя, отсортированные по дате создания
    const charts = await NatalChart.findAll({ 
      where: { userId },
      order: [['createdAt', 'DESC']]
    });
    
    return NextResponse.json({
      charts: charts || []
    });
  } catch (error: any) {
    console.error('Get natal charts error:', error);
    return NextResponse.json(
      { error: 'Ошибка при получении натальных карт' },
      { status: 500 }
    );
  }
}
