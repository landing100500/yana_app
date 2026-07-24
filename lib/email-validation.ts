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

  const mxOk = await ensureMxCached(domain);
  return mxOk ? { ok: true } : { ok: false, reason: 'no_mx' };
}

async function ensureMxCached(domain: string): Promise<boolean> {
  const cached = mxCache.get(domain);
  if (cached && Date.now() - cached.at < MX_CACHE_TTL_MS) {
    return cached.ok;
  }

  try {
    const mx = await dns.resolveMx(domain);
    const ok = Array.isArray(mx) && mx.length > 0;
    mxCache.set(domain, { ok, at: Date.now() });
    return ok;
  } catch {
    try {
      const a = await dns.resolve4(domain).catch(() => [] as string[]);
      const aaaa = a.length ? ([] as string[]) : await dns.resolve6(domain).catch(() => [] as string[]);
      const ok = a.length > 0 || aaaa.length > 0;
      mxCache.set(domain, { ok, at: Date.now() });
      return ok;
    } catch {
      mxCache.set(domain, { ok: false, at: Date.now() });
      return false;
    }
  }
}

/**
 * Пакетная валидация: MX один раз на домен, параллельно (не N DNS на каждого юзера).
 */
export async function validateEmailsForSendingBatch(
  emails: string[],
  concurrency = 20
): Promise<Map<string, EmailValidationResult>> {
  const out = new Map<string, EmailValidationResult>();
  const normalized = emails.map((e) => normalizeEmail(e)).filter(Boolean);
  const unique = Array.from(new Set(normalized));

  const domainsNeeded = new Set<string>();
  for (const email of unique) {
    if (!isValidEmailSyntax(email)) {
      out.set(email, { ok: false, reason: 'invalid_syntax' });
      continue;
    }
    const domain = domainOf(email);
    if (!domain) {
      out.set(email, { ok: false, reason: 'invalid_syntax' });
      continue;
    }
    if (BLOCKED_DOMAINS.has(domain)) {
      out.set(email, { ok: false, reason: 'blocked_domain' });
      continue;
    }
    const checkMx = String(process.env.MAIL_VALIDATE_MX || 'true').toLowerCase() !== 'false';
    if (!checkMx) {
      out.set(email, { ok: true });
      continue;
    }
    domainsNeeded.add(domain);
  }

  const domains = Array.from(domainsNeeded);
  for (let i = 0; i < domains.length; i += concurrency) {
    const chunk = domains.slice(i, i + concurrency);
    await Promise.all(chunk.map((d) => ensureMxCached(d)));
  }

  for (const email of unique) {
    if (out.has(email)) continue;
    const domain = domainOf(email)!;
    const cached = mxCache.get(domain);
    out.set(email, cached?.ok ? { ok: true } : { ok: false, reason: 'no_mx' });
  }

  return out;
}
