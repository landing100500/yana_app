import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { checkEmailForSpam } from '@/lib/mail-spam-check';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { subject, htmlBody } = await request.json();
    if (!subject || !htmlBody) {
      return NextResponse.json({ error: 'subject and htmlBody are required' }, { status: 400 });
    }

    const result = await checkEmailForSpam(String(subject), String(htmlBody));
    return NextResponse.json(result);
  } catch (error) {
    console.error('Spam check error:', error);
    return NextResponse.json({ error: 'Не удалось проверить письмо' }, { status: 500 });
  }
}
