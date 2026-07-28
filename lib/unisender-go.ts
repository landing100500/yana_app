/**
 * Unisender Go transactional API — только маркетинг (рассылки/цепочки).
 * OTP/алерты сюда не ходят.
 */

export function isUnisenderGoConfigured(): boolean {
  return Boolean(String(process.env.API_UNISENDER_GO || '').trim());
}

export function getUnisenderGoApiBaseUrl(): string {
  return String(process.env.UNISENDER_GO_API_URL || 'https://goapi.unisender.ru/ru/transactional/api/v1')
    .trim()
    .replace(/\/+$/, '');
}

export function getUnisenderGoFromEmail(): string {
  return (
    String(process.env.UNISENDER_GO_FROM_EMAIL || '').trim() ||
    'mail@yasna.chat'
  );
}

export function getUnisenderGoFromName(): string {
  return (
    String(process.env.UNISENDER_GO_FROM_NAME || '').trim() ||
    String(process.env.SMTP_FROM_NAME || '').trim() ||
    'YASNA'
  );
}

export type UnisenderGoInlineAttachment = {
  type: string;
  name: string;
  content: string; // base64
};

export type UnisenderGoSendOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  unsubscribeUrl?: string;
  inlineAttachments?: UnisenderGoInlineAttachment[];
  idempotenceKey?: string;
  metadata?: Record<string, string>;
};

export type UnisenderGoSendResult = {
  jobId: string;
  emails: string[];
};

export class UnisenderGoError extends Error {
  status: number;
  code: number | string | null;
  body: unknown;

  constructor(message: string, status: number, code: number | string | null, body: unknown) {
    super(message);
    this.name = 'UnisenderGoError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export async function sendViaUnisenderGo(options: UnisenderGoSendOptions): Promise<UnisenderGoSendResult> {
  const apiKey = String(process.env.API_UNISENDER_GO || '').trim();
  if (!apiKey) {
    throw new Error('API_UNISENDER_GO не задан');
  }

  const fromEmail = getUnisenderGoFromEmail();
  const fromName = getUnisenderGoFromName();
  const endpoint = `${getUnisenderGoApiBaseUrl()}/email/send.json`;

  const headers: Record<string, string> = {};
  if (options.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${options.unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  const payload = {
    message: {
      recipients: [{ email: options.to.trim().toLowerCase() }],
      subject: options.subject,
      from_email: fromEmail,
      from_name: fromName,
      reply_to: fromEmail,
      reply_to_name: fromName,
      body: {
        html: options.html,
        plaintext: options.text || undefined,
      },
      // Наш unsubscribe в футере + List-Unsubscribe. skip_unsubscribe=1 требует флаг в кабинете Go.
      skip_unsubscribe: 0,
      track_links: Number(process.env.UNISENDER_GO_TRACK_LINKS || 0) ? 1 : 0,
      track_read: Number(process.env.UNISENDER_GO_TRACK_READ || 0) ? 1 : 0,
      idempotence_key: options.idempotenceKey || undefined,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      inline_attachments:
        options.inlineAttachments && options.inlineAttachments.length > 0
          ? options.inlineAttachments
          : undefined,
      metadata: options.metadata || { source: 'yasna-mail-marketing' },
    },
  };

  const controller = new AbortController();
  const timeoutMs = Number(process.env.UNISENDER_GO_TIMEOUT_MS || 30_000);
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 30_000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const raw = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }

    if (!res.ok || parsed?.status === 'error') {
      const code = parsed?.code ?? null;
      const message =
        parsed?.message ||
        (typeof parsed === 'string' ? parsed : `Unisender Go HTTP ${res.status}`);
      throw new UnisenderGoError(String(message), res.status, code, parsed);
    }

    return {
      jobId: String(parsed?.job_id || ''),
      emails: Array.isArray(parsed?.emails) ? parsed.emails.map(String) : [options.to],
    };
  } finally {
    clearTimeout(timeout);
  }
}
