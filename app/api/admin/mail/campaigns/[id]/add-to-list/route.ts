import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { addCampaignRecipientsToList } from '@/lib/mail-marketing';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const { listId } = await request.json();
    if (!listId) {
      return NextResponse.json({ error: 'listId is required' }, { status: 400 });
    }

    const added = await addCampaignRecipientsToList(Number(id), Number(listId));
    return NextResponse.json({ success: true, added });
  } catch (error) {
    console.error('Add campaign to list error:', error);
    return NextResponse.json({ error: 'Failed to add recipients to list' }, { status: 500 });
  }
}
