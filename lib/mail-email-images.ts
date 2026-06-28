import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  extractMailImageFilename,
  guessMailImageContentType,
  isSafeMailImageFilename,
} from '@/lib/mail-image-utils';

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

  return { html: result, attachments };
}
