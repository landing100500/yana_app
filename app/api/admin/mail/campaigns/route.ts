import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import MailCampaign from '@/models/MailCampaign';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const campaigns = await MailCampaign.findAll({ order: [['createdAt', 'DESC']] });
    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error('Mail campaigns GET error:', error);
    return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const body = await request.json();
    const {
      name,
      subject,
      htmlBody,
      audienceType,
      audiencePlanCode,
      audienceListId,
      previousCampaignId,
    } = body;

    if (!name || !subject || !htmlBody || !audienceType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const campaign = await MailCampaign.create({
      name: String(name),
      subject: String(subject),
      htmlBody: String(htmlBody),
      audienceType,
      audiencePlanCode: audiencePlanCode || null,
      audienceListId: audienceListId ? Number(audienceListId) : null,
      previousCampaignId: previousCampaignId ? Number(previousCampaignId) : null,
      status: 'draft',
    });

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error('Mail campaigns POST error:', error);
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
}
