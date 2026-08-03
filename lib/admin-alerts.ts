import { getAppBaseUrl, getSmtpConfig, isSmtpConfigured, sendSimpleEmail } from '@/lib/email-transport';

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type AlertOptions = {
  source: string;
  severity: AlertSeverity;
  title: string;
  detail?: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
  error?: unknown;
  /** default 5 мин; 0 = без дедупа */
  dedupeMs?: number;
};

const recentAlerts = new Map<string, number>();
const MAX_DEDUPE_KEYS = 200;

function shouldSkipDedupe(key: string, dedupeMs: number): boolean {
  if (dedupeMs <= 0) return false;
  const now = Date.now();
  const prev = recentAlerts.get(key);
  if (prev && now - prev < dedupeMs) return true;
  recentAlerts.set(key, now);
  if (recentAlerts.size > MAX_DEDUPE_KEYS) {
    const now2 = Date.now();
    Array.from(recentAlerts.entries()).forEach(([k, ts]) => {
      if (now2 - ts > dedupeMs) recentAlerts.delete(k);
    });
  }
  return false;
}

function formatError(error: unknown): { message?: string; stack?: string } {
  if (!error) return {};
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack ? error.stack.slice(0, 4000) : undefined,
    };
  }
  return { message: String(error).slice(0, 1000) };
}

export function getAdminAlertsEmail(): string {
  return String(process.env.ADMIN_ALERTS_EMAIL || '').trim();
}

export function severityFromHttpStatus(status: number): AlertSeverity {
  if (status >= 500) return 'high';
  if (status === 429) return 'medium';
  if (status >= 400) return 'low';
  return 'info';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendEmailAlert(opts: AlertOptions): Promise<boolean> {
  const to = getAdminAlertsEmail();
  if (!to) {
    console.error('[admin-alerts] ADMIN_ALERTS_EMAIL is not set — skip');
    return false;
  }
  if (!isSmtpConfigured()) {
    console.error('[admin-alerts] SMTP not configured — skip');
    return false;
  }

  const err = formatError(opts.error);
  const appUrl = getAppBaseUrl();
  const when = new Date().toISOString();
  const severityLabel = opts.severity.toUpperCase();

  const metaRows = Object.entries(opts.meta || {})
    .filter(([, v]) => v !== undefined)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 8px;border:1px solid #ddd;"><b>${escapeHtml(k)}</b></td><td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(String(v))}</td></tr>`
    )
    .join('');

  const textParts = [
    `[${severityLabel}] ${opts.title}`,
    `source: ${opts.source}`,
    `app: ${appUrl}`,
    `time: ${when}`,
    opts.detail ? `detail: ${opts.detail}` : '',
    err.message ? `error: ${err.message}` : '',
    opts.meta
      ? `meta: ${JSON.stringify(opts.meta)}`
      : '',
    err.stack ? `\n${err.stack}` : '',
  ].filter(Boolean);

  const html = [
    `<h2>[${escapeHtml(severityLabel)}] ${escapeHtml(opts.title)}</h2>`,
    `<p><b>source:</b> ${escapeHtml(opts.source)}<br/>`,
    `<b>app:</b> ${escapeHtml(appUrl)}<br/>`,
    `<b>time:</b> ${escapeHtml(when)}</p>`,
    opts.detail ? `<p>${escapeHtml(opts.detail)}</p>` : '',
    metaRows ? `<table style="border-collapse:collapse;font-size:14px;">${metaRows}</table>` : '',
    err.message ? `<p><b>error:</b> ${escapeHtml(err.message)}</p>` : '',
    err.stack ? `<pre style="white-space:pre-wrap;background:#111;color:#eee;padding:12px;border-radius:8px;">${escapeHtml(err.stack)}</pre>` : '',
  ].join('\n');

  // Нельзя рекурсивно алертить падение SMTP алерта
  try {
    await sendSimpleEmail({
      to,
      subject: `[${severityLabel}] ${opts.title}`,
      text: textParts.join('\n'),
      html,
      headers: { 'X-YASNA-Alert': opts.severity },
    });
    return true;
  } catch (e) {
    console.error('[admin-alerts] failed to send email alert:', e);
    return false;
  }
}

export async function alertAdmin(opts: AlertOptions): Promise<boolean> {
  if (opts.severity === 'info') return false;

  const dedupeMs = opts.dedupeMs ?? 5 * 60 * 1000;
  const key = `${opts.source}:${opts.severity}:${opts.title}:${opts.detail || ''}`;
  if (shouldSkipDedupe(key, dedupeMs)) return false;

  return sendEmailAlert(opts);
}

export function alertAdminAsync(opts: AlertOptions): void {
  alertAdmin(opts).catch((e) => console.error('[admin-alerts] async:', e));
}

export function alertSmtpMisconfigured(source: string): void {
  alertAdminAsync({
    source,
    severity: 'high',
    title: 'SMTP не настроен',
    detail: 'Проверьте SMTP_HOST/USER/PASSWORD/FROM на сервере (PM2 env)',
    dedupeMs: 60 * 60 * 1000,
  });
}

/** Клиент оборвал стрим / контроллер уже закрыт — не OpenAI billing/model. */
function isClientStreamDisconnectError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'object' && (error as { name?: string }).name === 'AbortError') return true;
  const lower = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
  return (
    lower.includes('controller is already closed') ||
    lower.includes('invalid state') ||
    lower.includes('aborted') ||
    lower.includes('readable stream is locked')
  );
}

/** OpenAI / чат / любые AI-зависимости — critical, с дедупом */
export function alertOpenAiFailure(
  source: string,
  error: unknown,
  meta?: AlertOptions['meta']
): void {
  if (isClientStreamDisconnectError(error)) {
    console.warn(`[admin-alerts] skip OpenAI alert (${source}): client disconnect`, error);
    return;
  }

  const msg = error instanceof Error ? error.message : String(error || '');
  const lower = msg.toLowerCase();
  const billing =
    lower.includes('insufficient_quota') ||
    lower.includes('billing') ||
    lower.includes('exceeded your current quota') ||
    lower.includes('payment');
  const rate = lower.includes('rate_limit') || lower.includes('429');
  const deprecated =
    lower.includes('deprecated') ||
    lower.includes('model_not_found') ||
    lower.includes('does not exist');

  alertAdminAsync({
    source,
    severity: 'critical',
    title: billing
      ? 'OpenAI: закончился баланс / quota'
      : deprecated
        ? 'OpenAI: модель недоступна / deprecated'
        : rate
          ? 'OpenAI: rate limit'
          : 'OpenAI / AI: сбой ответа пользователю',
    detail: billing
      ? 'Пользователи видят ошибку чата. Проверьте billing.openai.com и ключ API_GPT на VPS.'
      : deprecated
        ? 'Смените OPENAI_CHAT_MODEL в .env.production (см. platform.openai.com/docs/deprecations) и pm2 restart.'
        : 'Пользователи видят «Извините, произошла ошибка…». Смотрите логи pm2 и ключ/модель.',
    meta,
    error,
    dedupeMs: billing || deprecated ? 30 * 60 * 1000 : 10 * 60 * 1000,
  });
}

/** Не трогает getSmtpConfig — только для subject from в алертах при отладке */
export function peekSmtpFrom(): string | null {
  try {
    return getSmtpConfig('transactional').from;
  } catch {
    return null;
  }
}
