import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initDatabase } from '@/lib/initDb';
import NatalChart from '@/models/NatalChart';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

export async function GET(
  request: NextRequest,
  { params }: { params: { chartId: string } }
) {
  try {
    await initDatabase();
    
    if (!(await checkAdminAuth())) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      );
    }

    const chartId = parseInt(params.chartId);
    if (isNaN(chartId)) {
      return NextResponse.json(
        { error: 'Неверный ID карты' },
        { status: 400 }
      );
    }

    // Получаем полную карту
    const chart = await NatalChart.findByPk(chartId);
    if (!chart) {
      return NextResponse.json(
        { error: 'Карта не найдена' },
        { status: 404 }
      );
    }

    // Преобразуем в формат, который ожидает компонент
    const chartData: any = {
      id: chart.id,
      name: chart.name,
      chartDate: chart.chartDate,
      chartTime: chart.chartTime,
      chartCity: chart.chartCity,
      sun: Number(chart.sun),
      moon: Number(chart.moon),
      mercury: Number(chart.mercury),
      venus: Number(chart.venus),
      mars: Number(chart.mars),
      jupiter: Number(chart.jupiter),
      saturn: Number(chart.saturn),
      uranus: Number(chart.uranus),
      neptune: Number(chart.neptune),
      pluto: Number(chart.pluto),
      northNode: Number(chart.northNode),
      southNode: Number(chart.southNode),
      ascendant: Number(chart.ascendant),
      midheaven: Number(chart.midheaven),
      house1: Number(chart.house1),
      house2: Number(chart.house2),
      house3: Number(chart.house3),
      house4: Number(chart.house4),
      house5: Number(chart.house5),
      house6: Number(chart.house6),
      house7: Number(chart.house7),
      house8: Number(chart.house8),
      house9: Number(chart.house9),
      house10: Number(chart.house10),
      house11: Number(chart.house11),
      house12: Number(chart.house12),
      createdAt: chart.createdAt,
    };

    return NextResponse.json({ chart: chartData });
  } catch (error: any) {
    console.error('Error fetching chart:', error);
    return NextResponse.json(
      { error: 'Ошибка при получении карты' },
      { status: 500 }
    );
  }
}
