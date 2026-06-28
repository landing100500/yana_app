import { extractMailImageFilename } from '@/lib/mail-image-utils';
import { getAppBaseUrl } from '@/lib/app-url';

const EMAIL_IMG_STYLE =
  'max-width:600px;width:100%;height:auto;display:block;margin:12px auto;border:0;';

const EDITOR_IMG_STYLE = 'max-width:100%;height:auto;display:block;margin:12px 0;border-radius:4px;';

export function publicMailImageUrl(filename: string): string {
  return `${getAppBaseUrl()}/mail-images/${filename}`;
}

export function editorMailImageUrl(filename: string): string {
  return `/api/admin/mail/images/${encodeURIComponent(filename)}`;
}

/** Канонический URL для хранения в БД и отправки. */
export function normalizeMailImageSrcForStorage(src: string): string {
  const filename = extractMailImageFilename(src);
  if (!filename) return src;
  return publicMailImageUrl(filename);
}

/** URL для отображения в админ-редакторе (через защищённый API). */
export function normalizeMailImageSrcForEditor(src: string): string {
  const filename = extractMailImageFilename(src);
  if (!filename) return src;
  return editorMailImageUrl(filename);
}

function normalizeImgTag(attrs: string, style: string, mapSrc: (src: string) => string): string {
  const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
  const src = srcMatch ? mapSrc(srcMatch[1]) : '';
  const altMatch = attrs.match(/\balt=["']([^"']*)["']/i);
  const alt = altMatch ? altMatch[1] : '';
  return `<img src="${src}" alt="${alt}" style="${style}" />`;
}

export function normalizeHtmlForStorage(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (_full, attrs: string) =>
    normalizeImgTag(attrs, EDITOR_IMG_STYLE, normalizeMailImageSrcForStorage)
  );
}

export function normalizeHtmlForEditor(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (_full, attrs: string) =>
    normalizeImgTag(attrs, EDITOR_IMG_STYLE, normalizeMailImageSrcForEditor)
  );
}

/** Перед отправкой письма — фиксированная ширина для email-клиентов. */
export function normalizeHtmlForEmailSend(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (_full, attrs: string) =>
    normalizeImgTag(attrs, EMAIL_IMG_STYLE, normalizeMailImageSrcForStorage)
  );
}
