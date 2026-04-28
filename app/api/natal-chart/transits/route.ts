import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { initDatabase } from '@/lib/initDb';
import NatalChart from '@/models/NatalChart';
import AdminNatalChart from '@/models/AdminNatalChart';
import { calculateTransitPositions } from '@/lib/transit-calculator';
import type { BirthData } from '@/lib/natal-chart-calculator';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'yasna-secret-key-change-in-production';

async function getUserIdFromCookie() {
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

async function isAdmin() {
  const cookieStore = await cookies();
  return cookieStore.get('admin_auth')?.value === 'true';
}

function parseDateParts(dateStr: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function parseTime(timeStr: string | undefined): { hour: number; minute: number } {
  if (!timeStr || typeof timeStr !== 'string') return { hour: 12, minute: 0 };
  const t = timeStr.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return { hour: 12, minute: 0 };
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { hour: 12, minute: 0 };
  return { hour, minute };
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const body = await request.json().catch(() => ({}));
    const chartId = typeof body.chartId === 'number' ? body.chartId : parseInt(String(body.chartId), 10);
    const dateStr = typeof body.date === 'string' ? body.date : '';
    const timeStr = typeof body.time === 'string' ? body.time : undefined;

    if (!chartId || Number.isNaN(chartId)) {
      return NextResponse.json({ error: 'Укажите chartId' }, { status: 400 });
    }

    const d = parseDateParts(dateStr);
    if (!d) {
      return NextResponse.json({ error: 'Неверный формат date (ожидается YYYY-MM-DD)' }, { status: 400 });
    }

    const userId = await getUserIdFromCookie();
    const admin = await isAdmin();

    let chart: InstanceType<typeof NatalChart> | InstanceType<typeof AdminNatalChart> | null =
      await NatalChart.findByPk(chartId);
    if (chart) {
      if (!admin && (!userId || Number((chart as any).userId) !== userId)) {
        return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
      }
    } else if (admin) {
      chart = await AdminNatalChart.findByPk(chartId);
    }
    if (!chart) {
      return NextResponse.json({ error: 'Карта не найдена' }, { status: 404 });
    }

    const { hour, minute } = parseTime(timeStr);
    const tz = Number(chart.timezone);

    const transitMoment: BirthData = {
      year: d.year,
      month: d.month,
      day: d.day,
      hour,
      minute,
      latitude: Number(chart.chartLatitude),
      longitude: Number(chart.chartLongitude),
      timezone: tz,
    };

    const result = await calculateTransitPositions({
      transitMoment,
      natalMoonLongitude: Number(chart.moon),
      natalAscendantLongitude: Number(chart.ascendant),
    });

    return NextResponse.json({
      chartId: chart.id,
      date: dateStr,
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      timezone: tz,
      city: chart.chartCity,
      julianDay: result.julianDay,
      transitLocalLabel: result.transitLocalLabel,
      natalReference: {
        moonSignIndex: Math.floor((Number(chart.moon) % 360) / 30) % 12,
        ascendantSignIndex: Math.floor((Number(chart.ascendant) % 360) / 30) % 12,
      },
      planets: result.planets.map((p) => ({
        key: p.key,
        label: p.label,
        signName: p.signNameSidereal,
        signIndex: p.signIndex,
        degreeInSign: Math.round(p.degreeInSign * 10000) / 10000,
        isRetrograde: p.isRetrograde,
        houseFromMoon: p.houseFromMoon,
        houseFromAscendant: p.houseFromAscendant,
      })),
    });
  } catch (error: any) {
    console.error('Transit calculation error:', error);
    return NextResponse.json(
      { error: error?.message || 'Ошибка расчёта транзитов' },
      { status: 500 }
    );
  }
}
