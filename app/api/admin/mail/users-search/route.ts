import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { searchMailUsers } from '@/lib/mail-list-users';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const p = request.nextUrl.searchParams;
    const result = await searchMailUsers({
      emailPrefix: p.get('email') || undefined,
      planCode: p.get('plan') || undefined,
      registeredFrom: p.get('registeredFrom') || undefined,
      registeredTo: p.get('registeredTo') || undefined,
      excludeListId: p.get('excludeListId') ? Number(p.get('excludeListId')) : undefined,
      limit: p.get('limit') ? Number(p.get('limit')) : 50,
      offset: p.get('offset') ? Number(p.get('offset')) : 0,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Mail users search error:', error);
    return NextResponse.json({ error: 'Failed to search users' }, { status: 500 });
  }
}
