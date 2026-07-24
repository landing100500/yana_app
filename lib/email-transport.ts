import nodemailer, { type Transporter } from 'nodemailer';
import { embedMailImagesInHtml, type MailImageAttachment } from '@/lib/mail-email-images';
import { normalizeHtmlForEmailSend } from '@/lib/mail-editor-html';

export interface SendMarketingEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  unsubscribeUrl?: string;
}

export interface SendSimpleEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
}

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName: string;
};

let cachedTransporter: Transporter | null = null;
let consecutiveSendFailures = 0;

export function getSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || user;
  const fromName = process.env.SMTP_FROM_NAME || 'YASNA';

  if (!host || !user || !pass || !from) {
    throw new Error('Email transport is not configured (SMTP_HOST/USER/PASSWORD/FROM)');
  }

  return { host, port, secure, user, pass, from, fromName };
}

export function isSmtpConfigured(): boolean {
  try {
    getSmtpConfig();
    return true;
  } catch {
    return false;
  }
}

/** Один pooled transporter на процесс — без этого Beget SMTP душит под нагрузкой. */
export function createMailTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const { host, port, secure, user, pass } = getSmtpConfig();
  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || 2),
    maxMessages: Number(process.env.SMTP_MAX_MESSAGES || 50),
    rateDelta: Number(process.env.SMTP_RATE_DELTA_MS || 1000),
    rateLimit: Number(process.env.SMTP_RATE_LIMIT || 5),
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 15000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 15000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 30000),
    tls: {
      // Beget иногда с самоподписанными цепочками на shared SMTP
      rejectUnauthorized: String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false',
    },
  });

  return cachedTransporter;
}

/** Сброс пула после фатальных ошибок соединения */
export function resetMailTransporter(): void {
  const current = cachedTransporter;
  cachedTransporter = null;
  if (current) {
    try {
      current.close();
    } catch {
      /* ignore */
    }
  }
}

export function getConsecutiveSmtpFailures(): number {
  return consecutiveSendFailures;
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isConnectionError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  return (
    code.includes('econn') ||
    code.includes('etimedout') ||
    code.includes('esocket') ||
    code.includes('econnreset') ||
    msg.includes('timeout') ||
    msg.includes('connection') ||
    msg.includes('socket') ||
    msg.includes('greet')
  );
}

export async function sendSimpleEmail(options: SendSimpleEmailOptions): Promise<void> {
  const { from, fromName } = getSmtpConfig();
  const transporter = createMailTransporter();

  try {
    await transporter.sendMail({
      from: fromName ? `"${fromName}" <${from}>` : from,
      to: options.to,
      subject: options.subject,
      replyTo: from,
      text: options.text,
      html: options.html,
      headers: options.headers,
    });
    consecutiveSendFailures = 0;
  } catch (error) {
    consecutiveSendFailures += 1;
    if (isConnectionError(error)) {
      resetMailTransporter();
    }
    throw error;
  }
}

export async function sendMarketingEmail(options: SendMarketingEmailOptions): Promise<void> {
  const { from, fromName } = getSmtpConfig();
  const transporter = createMailTransporter();

  const htmlPrepared = normalizeHtmlForEmailSend(options.html);
  const { html: htmlWithCid, attachments: imageAttachments } = await embedMailImagesInHtml(htmlPrepared);

  const headers: Record<string, string> = {
    'X-Auto-Response-Suppress': 'All',
  };

  if (options.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${options.unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  const inlineAttachments = imageAttachments.map((img: MailImageAttachment) => ({
    filename: img.filename,
    content: img.content,
    cid: img.cid,
    contentType: img.contentType,
    contentDisposition: 'inline' as const,
    encoding: 'base64' as const,
  }));

  try {
    await transporter.sendMail({
      from: fromName ? `"${fromName}" <${from}>` : from,
      to: options.to,
      subject: options.subject,
      replyTo: from,
      html: htmlWithCid,
      text: options.text || htmlToPlainText(htmlWithCid),
      headers,
      attachments: inlineAttachments.length > 0 ? inlineAttachments : undefined,
    });
    consecutiveSendFailures = 0;
  } catch (error) {
    consecutiveSendFailures += 1;
    if (isConnectionError(error)) {
      resetMailTransporter();
    }
    throw error;
  }
}

export function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  );
}
