import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface MailImageAttachment {
  filename: string;
  content: Buffer;
  cid: string;
  contentType: string;
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

export function extractMailImageFilename(src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith('cid:') || trimmed.startsWith('data:')) {
    return null;
  }

  try {
    const url = trimmed.startsWith('http') ? new URL(trimmed) : new URL(trimmed, 'https://yasna.chat');
    const match = url.pathname.match(/\/mail-images\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    const match = trimmed.match(/\/mail-images\/([^?"'\s]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

function guessContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'png';
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

function isSafeFilename(filename: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(filename);
}

/**
 * Заменяет ссылки на /mail-images/* на inline CID-вложения — так картинки
 * отображаются в почтовиках без загрузки с внешнего URL.
 */
export async function embedMailImagesInHtml(html: string): Promise<{
  html: string;
  attachments: MailImageAttachment[];
}> {
  const attachments: MailImageAttachment[] = [];
  const cidBySrc = new Map<string, string>();
  let result = html;

  const imgTagRegex = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  const srcs = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = imgTagRegex.exec(html)) !== null) {
    srcs.add(match[1]);
  }

  for (const src of Array.from(srcs)) {
    const filename = extractMailImageFilename(src);
    if (!filename || !isSafeFilename(filename)) continue;

    const filePath = path.join(process.cwd(), 'public', 'mail-images', filename);
    try {
      const content = await fs.readFile(filePath);
      const cid = `${crypto.randomBytes(12).toString('hex')}@yasna.chat`;
      cidBySrc.set(src, cid);
      attachments.push({
        filename,
        content,
        cid,
        contentType: guessContentType(filename),
      });
    } catch {
      console.warn('Mail image file not found for embed:', filename);
    }
  }

  for (const [src, cid] of Array.from(cidBySrc.entries())) {
    result = result.split(src).join(`cid:${cid}`);
  }

  return { html: result, attachments };
}
