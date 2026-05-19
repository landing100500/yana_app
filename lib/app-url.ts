export function getAppBaseUrl(): string {
  const url = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!url) {
    throw new Error('APP_URL is not configured');
  }
  return url.replace(/\/$/, '');
}
