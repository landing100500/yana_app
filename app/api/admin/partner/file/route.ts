import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readFile } from 'fs/promises';
import path from 'path';
import { initDatabase } from '@/lib/initDb';
import PartnerVerification from '@/models/PartnerVerification';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  return cookieStore.get('admin_auth')?.value === 'true';
}

export async function GET(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const id = Number(request.nextUrl.searchParams.get('id'));
    const kind = request.nextUrl.searchParams.get('kind');
    if (!id || (kind !== 'passport' && kind !== 'inn')) {
      return NextResponse.json({ error: 'id и kind обязательны' }, { status: 400 });
    }

    const row = await PartnerVerification.findByPk(id);
    if (!row) return NextResponse.json({ error: 'Не найдено' }, { status: 404 });

    const rel = kind === 'passport' ? row.passportScanPath : row.innScanPath;
    if (!rel || rel.includes('..')) {
      return NextResponse.json({ error: 'Некорректный путь' }, { status: 400 });
    }

    const fullPath = path.join(process.cwd(), rel);
    const buf = await readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const contentType =
      ext === '.pdf'
        ? 'application/pdf'
        : ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg';

    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('admin partner file:', error);
    return NextResponse.json({ error: 'Файл не найден' }, { status: 404 });
  }
}
