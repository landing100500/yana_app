import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  extractMailImageFilename,
  guessMailImageContentType,
  isSafeMailImageFilename,
} from '@/lib/mail-image-utils';
import { publicMailImageUrl } from '@/lib/mail-image-utils';

export { extractMailImageFilename } from '@/lib/mail-image-utils';

export interface MailImageAttachment {
  filename: string;
  content: Buffer;
  cid: string;
  contentType: string;
}

/**
 * Заменяет ссылки на /mail-images/* на inline CID-вложения.
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
    if (!filename || !isSafeMailImageFilename(filename)) continue;

    const filePath = path.join(process.cwd(), 'public', 'mail-images', filename);
    try {
      const content = await fs.readFile(filePath);
      const cid = `${crypto.randomBytes(12).toString('hex')}@yasna.chat`;
      cidBySrc.set(src, cid);
      attachments.push({
        filename,
        content,
        cid,
        contentType: guessMailImageContentType(filename),
      });
    } catch {
      console.warn('Mail image file not found for embed:', filename);
    }
  }

  for (const [src, cid] of Array.from(cidBySrc.entries())) {
    result = result.split(src).join(`cid:${cid}`);
  }

  // Fallback: если CID не сработал, подставляем публичный HTTPS URL
  result = result.replace(/<img\b([^>]*)>/gi, (full, attrs: string) => {
    const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcMatch) return full;
    const src = srcMatch[1];
    if (src.startsWith('cid:')) return full;
    const filename = extractMailImageFilename(src);
    if (!filename) return full;
    const publicUrl = publicMailImageUrl(filename);
    return full.replace(src, publicUrl);
  });

  return { html: result, attachments };
}
