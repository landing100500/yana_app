import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get('admin_auth')?.value === 'true';
}

export async function adminUnauthorizedResponse() {
  return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
}
