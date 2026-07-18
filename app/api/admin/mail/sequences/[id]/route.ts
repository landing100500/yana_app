import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import MailSequence from '@/models/MailSequence';
import MailSequenceStep from '@/models/MailSequenceStep';
import MailSequenceEnrollment from '@/models/MailSequenceEnrollment';
import MailSend from '@/models/MailSend';
import MailList from '@/models/MailList';
import { getSequenceStats } from '@/lib/mail-marketing';
import { parsePlanCode } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

function normalizeSequenceTrigger(body: {
  triggerType?: string;
  triggerPlanCode?: string | null;
}): { triggerType: string; triggerPlanCode: string | null } {
  const triggerType = body.triggerType || 'none';
  if (triggerType === 'plan_purchase') {
    const plan = parsePlanCode(body.triggerPlanCode);
    if (!plan || plan === 'free') {
      throw new Error('Для триггера «Покупка тарифа» выберите платный тариф');
    }
    return { triggerType, triggerPlanCode: plan };
  }
  return { triggerType, triggerPlanCode: null };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const sequence = await MailSequence.findByPk(Number(id));
    if (!sequence) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });

    const steps = await MailSequenceStep.findAll({
      where: { sequenceId: sequence.id },
      order: [['stepOrder', 'ASC']],
    });
    const enrollments = await MailSequenceEnrollment.findAll({
      where: { sequenceId: sequence.id },
      order: [['enrolledAt', 'DESC']],
      limit: 50,
    });
    const stats = await getSequenceStats(sequence.id);
    let launchListName: string | null = null;
    if (sequence.launchListId) {
      const list = await MailList.findByPk(sequence.launchListId, { attributes: ['name'] });
      launchListName = list?.name || null;
    }

    return NextResponse.json({ sequence, steps, enrollments, stats, launchListName });
  } catch (error) {
    console.error('Mail sequence GET error:', error);
    return NextResponse.json({ error: 'Failed to load sequence' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const sequence = await MailSequence.findByPk(Number(id));
    if (!sequence) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });

    const body = await request.json();
    const { name, description, triggerType, triggerPlanCode, steps } = body;

    if (sequence.launchedAt) {
      if (name !== undefined) await sequence.update({ name: String(name) });
      if (description !== undefined) {
        await sequence.update({ description: description ? String(description) : null });
      }
      if (triggerType !== undefined || triggerPlanCode !== undefined || steps !== undefined) {
        return NextResponse.json(
          { error: 'Запущенную цепочку нельзя редактировать. Приостановите или удалите её.' },
          { status: 400 }
        );
      }
    } else {
      const updates: Record<string, unknown> = {
        ...(name !== undefined ? { name: String(name) } : {}),
        ...(description !== undefined ? { description: description ? String(description) : null } : {}),
      };

      if (triggerType !== undefined || triggerPlanCode !== undefined) {
        try {
          const trigger = normalizeSequenceTrigger({
            triggerType: triggerType ?? sequence.triggerType,
            triggerPlanCode: triggerPlanCode !== undefined ? triggerPlanCode : sequence.triggerPlanCode,
          });
          updates.triggerType = trigger.triggerType;
          updates.triggerPlanCode = trigger.triggerPlanCode;
        } catch (e) {
          return NextResponse.json(
            { error: e instanceof Error ? e.message : 'Неверный триггер' },
            { status: 400 }
          );
        }
      }

      await sequence.update(updates);

      if (Array.isArray(steps)) {
        await MailSequenceStep.destroy({ where: { sequenceId: sequence.id } });
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          await MailSequenceStep.create({
            sequenceId: sequence.id,
            stepOrder: i + 1,
            delayDays: Number(step.delayDays) || 0,
            delayHours: Number(step.delayHours) || 0,
            subject: String(step.subject || ''),
            htmlBody: String(step.htmlBody || ''),
          });
        }
      }
    }

    const updatedSteps = await MailSequenceStep.findAll({
      where: { sequenceId: sequence.id },
      order: [['stepOrder', 'ASC']],
    });

    return NextResponse.json({ sequence, steps: updatedSteps });
  } catch (error) {
    console.error('Mail sequence PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update sequence' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const sequence = await MailSequence.findByPk(Number(id));
    if (!sequence) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });

    const enrollments = await MailSequenceEnrollment.findAll({ where: { sequenceId: sequence.id } });
    const enrollmentIds = enrollments.map((e) => e.id);

    await MailSend.destroy({
      where: { enrollmentId: enrollmentIds },
    });
    await MailSequenceEnrollment.destroy({ where: { sequenceId: sequence.id } });
    await MailSequenceStep.destroy({ where: { sequenceId: sequence.id } });
    await sequence.destroy();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mail sequence DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete sequence' }, { status: 500 });
  }
}
