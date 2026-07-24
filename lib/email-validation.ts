import dns from 'dns/promises';

const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/** Явно мусорные / одноразовые — не тратим SMTP */
const BLOCKED_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  '10minutemail.com',
  'trashmail.com',
  'yopmail.com',
  'example.com',
  'example.org',
  'test.com',
  'localhost',
]);

const mxCache = new Map<string, { ok: boolean; at: number }>();
const MX_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type EmailValidationResult = {
  ok: boolean;
  reason?: string;
};

export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmailSyntax(email: string): boolean {
  const e = normalizeEmail(email);
  if (!e || e.length > 254) return false;
  if (e.includes('..') || e.startsWith('.') || e.includes('@.') || e.endsWith('.')) return false;
  return EMAIL_RE.test(e);
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  return email.slice(at + 1);
}

/**
 * Быстрая проверка перед постановкой в очередь / отправкой.
 * MAIL_VALIDATE_MX=false — только синтаксис (быстрее).
 * Платный Unisender validator — отдельно, если понадобится API key.
 */
export async function validateEmailForSending(email: string): Promise<EmailValidationResult> {
  const e = normalizeEmail(email);
  if (!isValidEmailSyntax(e)) {
    return { ok: false, reason: 'invalid_syntax' };
  }

  const domain = domainOf(e);
  if (!domain) return { ok: false, reason: 'invalid_syntax' };
  if (BLOCKED_DOMAINS.has(domain)) {
    return { ok: false, reason: 'blocked_domain' };
  }

  const checkMx = String(process.env.MAIL_VALIDATE_MX || 'true').toLowerCase() !== 'false';
  if (!checkMx) return { ok: true };

  const cached = mxCache.get(domain);
  if (cached && Date.now() - cached.at < MX_CACHE_TTL_MS) {
    return cached.ok ? { ok: true } : { ok: false, reason: 'no_mx' };
  }

  try {
    const mx = await dns.resolveMx(domain);
    const ok = Array.isArray(mx) && mx.length > 0;
    mxCache.set(domain, { ok, at: Date.now() });
    return ok ? { ok: true } : { ok: false, reason: 'no_mx' };
  } catch {
    // Некоторые домены принимают почту на A-записи без MX — пробуем A/AAAA
    try {
      const a = await dns.resolve4(domain).catch(() => []);
      const aaaa = a.length ? [] : await dns.resolve6(domain).catch(() => []);
      const ok = a.length > 0 || aaaa.length > 0;
      mxCache.set(domain, { ok, at: Date.now() });
      return ok ? { ok: true } : { ok: false, reason: 'no_mx' };
    } catch {
      mxCache.set(domain, { ok: false, at: Date.now() });
      return { ok: false, reason: 'no_mx' };
    }
  }
}
