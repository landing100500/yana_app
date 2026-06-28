import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import MailCampaign from '@/models/MailCampaign';
import MailSend from '@/models/MailSend';
import { validateScheduledAt } from '@/lib/mail-marketing';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const campaign = await MailCampaign.findByPk(Number(id));
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const sends = await MailSend.findAll({
      where: { campaignId: campaign.id },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    return NextResponse.json({ campaign, sends });
  } catch (error) {
    console.error('Mail campaign GET error:', error);
    return NextResponse.json({ error: 'Failed to load campaign' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const campaign = await MailCampaign.findByPk(Number(id));
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status !== 'draft' && campaign.status !== 'failed' && campaign.status !== 'scheduled') {
      return NextResponse.json({ error: 'Cannot edit campaign in current status' }, { status: 400 });
    }

    const body = await request.json();
    const allowed = [
      'name',
      'subject',
      'htmlBody',
      'audienceType',
      'audiencePlanCode',
      'audienceListId',
      'previousCampaignId',
      'scheduledAt',
    ] as const;

    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    if (body.scheduledAt === null) {
      updates.scheduledAt = null;
    } else if (body.scheduledAt) {
      const at = new Date(body.scheduledAt);
      validateScheduledAt(at);
      updates.scheduledAt = at;
    }

    await campaign.update(updates);
    return NextResponse.json({ campaign });
  } catch (error) {
    console.error('Mail campaign PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const campaign = await MailCampaign.findByPk(Number(id));
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status === 'sending' || campaign.status === 'queued') {
      return NextResponse.json({ error: 'Cannot delete active campaign' }, { status: 400 });
    }

    if (campaign.status === 'scheduled') {
      await campaign.update({ status: 'draft', scheduledAt: null });
    }

    await MailSend.destroy({ where: { campaignId: campaign.id, status: 'pending' } });
    await campaign.destroy();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mail campaign DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
  }
}
