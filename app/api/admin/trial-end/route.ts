import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initDatabase } from '@/lib/initDb';
import {
  getTrialEndLetterEnabled,
  setTrialEndLetterEnabled,
  getTrialEndTemplates,
  setTrialEndTemplates,
  type TrialEndTemplates,
} from '@/lib/trial-end-letter';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

export async function GET() {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await initDatabase();
    const [enabled, templates] = await Promise.all([
      getTrialEndLetterEnabled(),
      getTrialEndTemplates(),
    ]);
    return NextResponse.json({ enabled, templates });
  } catch (e) {
    console.error('admin trial-end GET:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    await initDatabase();

    if (typeof body.enabled === 'boolean') {
      await setTrialEndLetterEnabled(body.enabled);
    }

    let templates = await getTrialEndTemplates();
    if (body.templates && typeof body.templates === 'object') {
      templates = await setTrialEndTemplates(body.templates as TrialEndTemplates);
    }

    const enabled = await getTrialEndLetterEnabled();
    return NextResponse.json({ enabled, templates });
  } catch (e) {
    console.error('admin trial-end PATCH:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
