import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

type RouteContext = { params: Promise<{ filename: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const { filename } = await context.params;
    const decoded = decodeURIComponent(filename);
    if (!/^[a-zA-Z0-9._-]+$/.test(decoded)) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), 'public', 'mail-images', decoded);
    const content = await readFile(filePath);
    const ext = decoded.split('.').pop()?.toLowerCase() || 'png';

    return new NextResponse(content, {
      headers: {
        'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }
}
