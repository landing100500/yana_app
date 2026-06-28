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

export function guessMailImageContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'png';
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

export function isSafeMailImageFilename(filename: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(filename);
}
