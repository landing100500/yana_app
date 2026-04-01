import { NextRequest } from 'next/server';

/** IP клиента для sms.ru (параметр ip), не IP сервера. */
export function getClientIp(request: NextRequest): string | undefined {
  const xf = request.headers.get('x-forwarded-for');
  if (xf) {
    const first = xf.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') || undefined;
}
