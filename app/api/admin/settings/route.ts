import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initDatabase } from '@/lib/initDb';
import {
  getPersonalityReadingAlgorithmEnabled,
  setPersonalityReadingAlgorithmEnabled,
} from '@/lib/app-settings';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

export async function GET() {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await initDatabase();
    const personalityReadingAlgorithm = await getPersonalityReadingAlgorithmEnabled();
    return NextResponse.json({ personalityReadingAlgorithm });
  } catch (e) {
    console.error('admin settings GET:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    if (typeof body.personalityReadingAlgorithm !== 'boolean') {
      return NextResponse.json(
        { error: 'Ожидается personalityReadingAlgorithm: boolean' },
        { status: 400 }
      );
    }
    await initDatabase();
    await setPersonalityReadingAlgorithmEnabled(body.personalityReadingAlgorithm);
    return NextResponse.json({ personalityReadingAlgorithm: body.personalityReadingAlgorithm });
  } catch (e) {
    console.error('admin settings PATCH:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
