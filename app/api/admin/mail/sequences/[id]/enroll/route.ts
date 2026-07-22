import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import MailSequence from '@/models/MailSequence';
import { launchSequenceOnAllUsers, launchSequenceOnList } from '@/lib/mail-marketing';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const sequence = await MailSequence.findByPk(Number(id));
    if (!sequence) return NextResponse.json({ error: 'Цепочка не найдена' }, { status: 404 });

    const body = await request.json();
    const audience = body.audience === 'all' ? 'all' : 'list';
    const trigger = sequence.triggerType === 'none' ? 'manual' : sequence.triggerType;

    if (audience === 'all') {
      if (trigger !== 'all_users') {
        return NextResponse.json(
          { error: 'Для запуска на всех выберите триггер «Все зарегистрированные»' },
          { status: 400 }
        );
      }
      const result = await launchSequenceOnAllUsers(sequence.id);
      return NextResponse.json({ success: true, audience: 'all', ...result });
    }

    if (trigger !== 'manual') {
      return NextResponse.json(
        { error: 'Для запуска по списку выберите триггер «По списку»' },
        { status: 400 }
      );
    }

    const listId = body.listId;
    if (!listId) {
      return NextResponse.json({ error: 'Выберите список' }, { status: 400 });
    }

    const result = await launchSequenceOnList(Number(listId), sequence.id);
    return NextResponse.json({ success: true, audience: 'list', ...result });
  } catch (error) {
    console.error('Mail sequence enroll error:', error);
    const message = error instanceof Error ? error.message : 'Не удалось запустить цепочку';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
