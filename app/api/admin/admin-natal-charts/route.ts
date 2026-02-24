import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initDatabase } from '@/lib/initDb';
import AdminNatalChart from '@/models/AdminNatalChart';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

export async function GET() {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const charts = await AdminNatalChart.findAll({
      order: [['createdAt', 'DESC']],
    });

    const list = charts.map((chart: any) => ({
      id: chart.id,
      name: chart.name,
      chartDate: chart.chartDate,
      chartTime: chart.chartTime,
      chartCity: chart.chartCity,
      createdAt: chart.createdAt,
    }));

    return NextResponse.json({ charts: list });
  } catch (error: any) {
    console.error('Error fetching admin natal charts:', error);
    return NextResponse.json(
      { error: 'Ошибка при получении списка карт' },
      { status: 500 }
    );
  }
}
