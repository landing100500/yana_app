import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import MailSequence from '@/models/MailSequence';
import MailSequenceStep from '@/models/MailSequenceStep';
import MailList from '@/models/MailList';
import { getSequenceStats, repairLegacySequenceLaunch } from '@/lib/mail-marketing';
import { normalizeSequenceRulesInput } from '@/lib/mail-sequence-rules';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const sequences = await MailSequence.findAll({ order: [['createdAt', 'DESC']] });
    const withSteps = await Promise.all(
      sequences.map(async (seq) => {
        const repaired = await repairLegacySequenceLaunch(seq);
        const steps = await MailSequenceStep.findAll({
          where: { sequenceId: seq.id },
          order: [['stepOrder', 'ASC']],
          attributes: ['stepOrder', 'delayDays', 'delayHours', 'subject'],
        });
        const stats = await getSequenceStats(seq.id);
        let launchListName: string | null = null;
        if (repaired.launchListId) {
          const list = await MailList.findByPk(repaired.launchListId, { attributes: ['name'] });
          launchListName = list?.name || null;
        }
        let excludeListName: string | null = null;
        if (repaired.excludeListId) {
          const list = await MailList.findByPk(repaired.excludeListId, { attributes: ['name'] });
          excludeListName = list?.name || null;
        }
        return { ...repaired.toJSON(), steps, stats, launchListName, excludeListName };
      })
    );

    return NextResponse.json({ sequences: withSteps });
  } catch (error) {
    console.error('Mail sequences GET error:', error);
    return NextResponse.json({ error: 'Failed to load sequences' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const body = await request.json();
    const { name, description, steps, ...rulesBody } = body;
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    let rules;
    try {
      rules = normalizeSequenceRulesInput(rulesBody);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Неверный триггер' }, { status: 400 });
    }

    const sequence = await MailSequence.create({
      name: String(name),
      description: description ? String(description) : null,
      triggerType: rules.triggerType as 'manual' | 'new_user' | 'none' | 'plan_purchase',
      triggerPlanCode: rules.triggerPlanCode,
      triggerPlanCodes: rules.triggerPlanCodes,
      excludePlanCodes: rules.excludePlanCodes,
      excludeAllPaidPlans: rules.excludeAllPaidPlans,
      excludeListId: rules.excludeListId,
      isActive: false,
      launchedAt: null,
      launchListId: null,
    });

    if (Array.isArray(steps)) {
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

    const createdSteps = await MailSequenceStep.findAll({
      where: { sequenceId: sequence.id },
      order: [['stepOrder', 'ASC']],
    });

    return NextResponse.json({ sequence, steps: createdSteps });
  } catch (error) {
    console.error('Mail sequences POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create sequence';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
