import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initDatabase } from '@/lib/initDb';
import {
  getPersonalityReadingAlgorithmEnabled,
  setPersonalityReadingAlgorithmEnabled,
} from '@/lib/app-settings';
import {
  getFreeAiRequestsForNewUsers,
  setFreeAiRequestsForNewUsers,
} from '@/lib/free-ai-requests-settings';

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
    const [personalityReadingAlgorithm, freeAiRequestsForNewUsers] = await Promise.all([
      getPersonalityReadingAlgorithmEnabled(),
      getFreeAiRequestsForNewUsers(),
    ]);
    return NextResponse.json({
      personalityReadingAlgorithm,
      freeAiRequestsForNewUsers,
    });
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
    await initDatabase();

    const hasAlgo = typeof body.personalityReadingAlgorithm === 'boolean';
    const hasFreeLimit = body.freeAiRequestsForNewUsers !== undefined;

    if (!hasAlgo && !hasFreeLimit) {
      return NextResponse.json(
        {
          error:
            'Ожидается personalityReadingAlgorithm: boolean и/или freeAiRequestsForNewUsers: number',
        },
        { status: 400 }
      );
    }

    const result: {
      personalityReadingAlgorithm?: boolean;
      freeAiRequestsForNewUsers?: number;
    } = {};

    if (hasAlgo) {
      await setPersonalityReadingAlgorithmEnabled(body.personalityReadingAlgorithm);
      result.personalityReadingAlgorithm = body.personalityReadingAlgorithm;
    }

    if (hasFreeLimit) {
      const n = Number(body.freeAiRequestsForNewUsers);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { error: 'freeAiRequestsForNewUsers должен быть числом ≥ 0' },
          { status: 400 }
        );
      }
      result.freeAiRequestsForNewUsers = await setFreeAiRequestsForNewUsers(n);
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error('admin settings PATCH:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
