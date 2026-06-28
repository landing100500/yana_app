import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import MailSequence from '@/models/MailSequence';
import { setSequencePaused } from '@/lib/mail-marketing';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const sequence = await MailSequence.findByPk(Number(id));
    if (!sequence) return NextResponse.json({ error: 'Цепочка не найдена' }, { status: 404 });

    await setSequencePaused(sequence.id, true);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mail sequence pause error:', error);
    const message = error instanceof Error ? error.message : 'Не удалось приостановить цепочку';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
