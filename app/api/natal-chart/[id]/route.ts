import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { initDatabase } from '@/lib/initDb';
import NatalChart from '@/models/NatalChart';
import UserAnketa from '@/models/UserAnketa';
import { recalculateChartFromBirthInput } from '@/lib/natal-chart-recalculate';

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initDatabase();

    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const chartId = parseInt(params.id, 10);
    if (isNaN(chartId)) {
      return NextResponse.json({ error: 'Неверный ID карты' }, { status: 400 });
    }

    const chart = await NatalChart.findOne({
      where: { id: chartId, userId },
    });
    if (!chart) {
      return NextResponse.json({ error: 'Карта не найдена' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const chartTime = typeof body.chartTime === 'string' ? body.chartTime.trim() : '';
    const chartCity = typeof body.chartCity === 'string' ? body.chartCity.trim() : '';

    if (!chartTime || !chartCity) {
      return NextResponse.json(
        { error: 'Укажите время и город рождения.' },
        { status: 400 }
      );
    }

    let recalculated;
    try {
      recalculated = await recalculateChartFromBirthInput({
        chartDate: chart.chartDate,
        chartTime,
        chartCity,
      });
    } catch (calcError: any) {
      return NextResponse.json(
        {
          error: calcError.message || 'Не удалось пересчитать карту.',
          suggestion: 'Проверьте формат времени (HH:MM) и название города.',
        },
        { status: 400 }
      );
    }

    const { chartData, ...updateFields } = recalculated;
    await chart.update(updateFields);

    if ((chart as any).isMain) {
      const anketa = await UserAnketa.findOne({ where: { userId } });
      if (anketa) {
        anketa.birthTime = recalculated.chartTime;
        anketa.birthCity = recalculated.chartCity;
        await anketa.save();
      }
    }

    return NextResponse.json({
      success: true,
      chart: {
        ...chart.toJSON(),
        navamsha: chartData.navamsha,
        dashas: chartData.dashas,
      },
    });
  } catch (error: any) {
    console.error('Update natal chart error:', error);
    return NextResponse.json(
      { error: error.message || 'Ошибка при обновлении натальной карты' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initDatabase();

    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      );
    }

    const chartId = parseInt(params.id);
    if (isNaN(chartId)) {
      return NextResponse.json(
        { error: 'Неверный ID карты' },
        { status: 400 }
      );
    }

    // Проверяем, что карта принадлежит пользователю
    const chart = await NatalChart.findOne({
      where: { id: chartId, userId }
    });

    if (!chart) {
      return NextResponse.json(
        { error: 'Карта не найдена' },
        { status: 404 }
      );
    }

    if ((chart as any).isMain) {
      return NextResponse.json(
        { error: 'Основную карту удалить нельзя' },
        { status: 400 }
      );
    }

    // Удаляем карту (все связанные записи удалятся автоматически благодаря CASCADE)
    await chart.destroy();

    return NextResponse.json({
      success: true,
      message: 'Карта успешно удалена'
    });
  } catch (error: any) {
    console.error('Delete natal chart error:', error);
    return NextResponse.json(
      { error: error.message || 'Ошибка при удалении натальной карты' },
      { status: 500 }
    );
  }
}
