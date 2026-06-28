import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import MailSequence from '@/models/MailSequence';
import MailSequenceStep from '@/models/MailSequenceStep';
import MailSequenceEnrollment from '@/models/MailSequenceEnrollment';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const sequences = await MailSequence.findAll({ order: [['createdAt', 'DESC']] });
    const withSteps = await Promise.all(
      sequences.map(async (seq) => {
        const steps = await MailSequenceStep.findAll({
          where: { sequenceId: seq.id },
          order: [['stepOrder', 'ASC']],
        });
        const enrollmentCount = await MailSequenceEnrollment.count({ where: { sequenceId: seq.id } });
        return { ...seq.toJSON(), steps, enrollmentCount };
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

    const { name, description, triggerType, isActive, steps } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const sequence = await MailSequence.create({
      name: String(name),
      description: description ? String(description) : null,
      triggerType: triggerType || 'none',
      isActive: !!isActive,
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
    return NextResponse.json({ error: 'Failed to create sequence' }, { status: 500 });
  }
}
