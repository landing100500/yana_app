import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { getMailFooterHtml, setMailFooterHtml } from '@/lib/mail-footer';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const html = await getMailFooterHtml();
    return NextResponse.json({ html });
  } catch (error) {
    console.error('Mail footer GET error:', error);
    return NextResponse.json({ error: 'Failed to load footer' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { html } = await request.json();
    if (typeof html !== 'string') {
      return NextResponse.json({ error: 'html is required' }, { status: 400 });
    }

    await setMailFooterHtml(html);
    return NextResponse.json({ success: true, html });
  } catch (error) {
    console.error('Mail footer PUT error:', error);
    return NextResponse.json({ error: 'Failed to save footer' }, { status: 500 });
  }
}
