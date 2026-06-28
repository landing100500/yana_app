const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

function decodeFilename(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function extractMailImageFilename(src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith('cid:') || trimmed.startsWith('data:')) {
    return null;
  }

  const patterns = [
    /\/mail-images\/([^/?#"'\s]+)/i,
    /\/api\/admin\/mail\/images\/([^/?#"'\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return decodeFilename(match[1]);
  }

  try {
    const url = trimmed.startsWith('http') ? new URL(trimmed) : new URL(trimmed, 'https://yasna.chat');
    for (const pattern of patterns) {
      const match = url.pathname.match(pattern);
      if (match?.[1]) return decodeFilename(match[1]);
    }
  } catch {
    // ignore invalid URL
  }

  return null;
}

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    'https://yasna.chat'
  ).replace(/\/$/, '');
}

export function publicMailImageUrl(filename: string): string {
  return `${getBaseUrl()}/mail-images/${filename}`;
}

export function editorMailImageUrl(filename: string): string {
  return `/api/admin/mail/images/${encodeURIComponent(filename)}`;
}

export function guessMailImageContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'png';
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

export function isSafeMailImageFilename(filename: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(filename);
}
