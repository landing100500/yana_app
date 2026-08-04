import { NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { getFreeAiRequestsForNewUsers } from '@/lib/free-ai-requests-settings';
import { FREE_AI_REQUESTS_LIMIT } from '@/lib/free-ai-requests-constants';

export const dynamic = 'force-dynamic';

/** Публичные параметры тарифов (без авторизации). */
export async function GET() {
  try {
    await initDatabase();
    const freeAiRequestsForNewUsers = await getFreeAiRequestsForNewUsers();
    return NextResponse.json(
      { freeAiRequestsForNewUsers },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    console.error('public plan-info GET:', error);
    return NextResponse.json({ freeAiRequestsForNewUsers: FREE_AI_REQUESTS_LIMIT });
  }
}
