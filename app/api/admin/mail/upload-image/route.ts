import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { getAppBaseUrl } from '@/lib/email-transport';

export const dynamic = 'force-dynamic';

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Допустимы только JPEG, PNG, GIF, WebP' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Максимальный размер файла 5 МБ' }, { status: 400 });
    }

    const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const dir = path.join(process.cwd(), 'public', 'mail-images');
    await mkdir(dir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);

    const url = `${getAppBaseUrl()}/mail-images/${filename}`;
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Mail image upload error:', error);
    return NextResponse.json({ error: 'Не удалось загрузить изображение' }, { status: 500 });
  }
}
