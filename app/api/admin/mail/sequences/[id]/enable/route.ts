import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import MailSequence from '@/models/MailSequence';
import { enableSequenceForNewUsers, setSequencePaused } from '@/lib/mail-marketing';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const sequence = await MailSequence.findByPk(Number(id));
    if (!sequence) return NextResponse.json({ error: 'Цепочка не найдена' }, { status: 404 });

    if (sequence.launchedAt) {
      await setSequencePaused(sequence.id, false);
      return NextResponse.json({ success: true, resumed: true });
    }

    if (sequence.triggerType !== 'new_user') {
      return NextResponse.json(
        { error: 'Запустите цепочку по списку — кнопка «Запустить по списку»' },
        { status: 400 }
      );
    }

    await enableSequenceForNewUsers(sequence.id);
    return NextResponse.json({ success: true, enabled: true });
  } catch (error) {
    console.error('Mail sequence enable error:', error);
    const message = error instanceof Error ? error.message : 'Не удалось включить цепочку';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
