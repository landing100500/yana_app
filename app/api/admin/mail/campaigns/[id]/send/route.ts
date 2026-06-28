import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import MailCampaign from '@/models/MailCampaign';
import { queueCampaign } from '@/lib/mail-marketing';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { id } = await context.params;
    const campaign = await MailCampaign.findByPk(Number(id));
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const result = await queueCampaign(campaign.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to queue campaign';
    console.error('Mail campaign send error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
