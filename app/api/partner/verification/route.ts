import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { initDatabase } from '@/lib/initDb';
import { getAuthenticatedUserId } from '@/lib/auth-user';
import { getOrCreatePartnerProfile } from '@/lib/partner';
import PartnerVerification from '@/models/PartnerVerification';
import PartnerProfile from '@/models/PartnerProfile';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_BYTES = 8 * 1024 * 1024;

async function saveUpload(file: File, userId: number, kind: string): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw Object.assign(new Error('Допустимы JPG, PNG, WEBP или PDF'), { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    throw Object.assign(new Error('Файл слишком большой (макс. 8 МБ)'), { status: 400 });
  }

  const ext =
    file.type === 'application/pdf'
      ? 'pdf'
      : file.type === 'image/png'
        ? 'png'
        : file.type === 'image/webp'
          ? 'webp'
          : 'jpg';

  const dir = path.join(process.cwd(), 'private', 'partner-kyc', String(userId));
  await mkdir(dir, { recursive: true });
  const filename = `${kind}-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  const fullPath = path.join(dir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buffer);
  return path.join('private', 'partner-kyc', String(userId), filename);
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const form = await request.formData();
    const passport = form.get('passport');
    const inn = form.get('inn');
    const innNumber = String(form.get('innNumber') || '').trim() || null;

    if (!(passport instanceof File) || !(inn instanceof File)) {
      return NextResponse.json({ error: 'Загрузите сканы паспорта и ИНН' }, { status: 400 });
    }

    await getOrCreatePartnerProfile(userId);

    const pending = await PartnerVerification.findOne({
      where: { partnerUserId: userId, status: 'pending' },
    });
    if (pending) {
      return NextResponse.json(
        { error: 'Заявка на верификацию уже на рассмотрении' },
        { status: 409 }
      );
    }

    const passportScanPath = await saveUpload(passport, userId, 'passport');
    const innScanPath = await saveUpload(inn, userId, 'inn');

    const row = await PartnerVerification.create({
      partnerUserId: userId,
      passportScanPath,
      innScanPath,
      innNumber,
      status: 'pending',
    });

    await PartnerProfile.update(
      { verificationStatus: 'pending' },
      { where: { userId } }
    );

    return NextResponse.json({
      success: true,
      verification: {
        id: row.id,
        status: row.status,
      },
    });
  } catch (error: any) {
    console.error('partner verification error:', error);
    return NextResponse.json(
      { error: error?.message || 'Ошибка загрузки документов' },
      { status: error?.status || 500 }
    );
  }
}
