import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import MailSequence from '@/models/MailSequence';
import { enrollListInSequence, enrollUserInSequence } from '@/lib/mail-marketing';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const sequence = await MailSequence.findByPk(Number(id));
    if (!sequence) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });

    const { listId, userIds } = await request.json();

    if (listId) {
      const enrolled = await enrollListInSequence(Number(listId), sequence.id);
      return NextResponse.json({ success: true, enrolled });
    }

    if (Array.isArray(userIds) && userIds.length > 0) {
      let enrolled = 0;
      for (const userId of userIds) {
        const ok = await enrollUserInSequence(Number(userId), sequence.id);
        if (ok) enrolled++;
      }
      return NextResponse.json({ success: true, enrolled });
    }

    return NextResponse.json({ error: 'listId or userIds required' }, { status: 400 });
  } catch (error) {
    console.error('Mail sequence enroll error:', error);
    return NextResponse.json({ error: 'Failed to enroll users' }, { status: 500 });
  }
}
