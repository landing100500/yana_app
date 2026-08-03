import nodemailer, { type Transporter } from 'nodemailer';
import crypto from 'crypto';
import { embedMailImagesInHtml, type MailImageAttachment } from '@/lib/mail-email-images';
import { normalizeHtmlForEmailSend } from '@/lib/mail-editor-html';
import { isConnectionError, isMailboxSendingDisabled, isProviderQuotaExhaustedError } from '@/lib/smtp-errors';
import { pauseMarketingMail } from '@/lib/mail-send-guard';
import {
  isUnisenderGoConfigured,
  sendViaUnisenderGo,
  getUnisenderGoFromEmail,
  getUnisenderGoFromName,
} from '@/lib/unisender-go';

export type SmtpChannel = 'transactional' | 'marketing';

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
  channel: SmtpChannel;
};

const transporters: Partial<Record<SmtpChannel, Transporter>> = {};
let consecutiveSendFailures = 0;
let lastFatalTripAt = 0;

function envTrim(name: string): string {
  return String(process.env[name] || '').trim();
}

/**
 * marketing: всегда SMTP_* (рассылки) — только fallback, если Unisender Go не настроен
 * transactional (OTP/алерты): SMTP_OTP_* если задан USER/HOST, иначе fallback на SMTP_*
 */
export function getSmtpConfig(channel: SmtpChannel = 'transactional'): SmtpConfig {
  const useOtp =
    channel === 'transactional' &&
    Boolean(envTrim('SMTP_OTP_USER') || envTrim('SMTP_OTP_HOST'));
  const prefix = useOtp ? 'SMTP_OTP_' : 'SMTP_';

  const host = envTrim(`${prefix}HOST`) || envTrim('SMTP_HOST');
  const port = Number(envTrim(`${prefix}PORT`) || envTrim('SMTP_PORT') || 587);
  const secureRaw = envTrim(`${prefix}SECURE`) || envTrim('SMTP_SECURE');
  const secure = secureRaw.toLowerCase() === 'true';
  const user = envTrim(`${prefix}USER`) || envTrim('SMTP_USER');
  const pass = envTrim(`${prefix}PASSWORD`) || envTrim('SMTP_PASSWORD');
  const from = envTrim(`${prefix}FROM`) || envTrim('SMTP_FROM') || user;
  const fromName =
    envTrim(`${prefix}FROM_NAME`) || envTrim('SMTP_FROM_NAME') || 'YASNA';

  const missing = [
    !host && 'HOST',
    !user && 'USER',
    !pass && 'PASSWORD',
    !from && 'FROM',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Email transport (${channel}) is not configured (missing: ${missing.join(', ')}). ` +
        `Проверьте SMTP_* и SMTP_OTP_* в .env.production`
    );
  }

  return { host, port, secure, user, pass, from, fromName, channel };
}

export function isSmtpConfigured(channel: SmtpChannel = 'transactional'): boolean {
  try {
    getSmtpConfig(channel);
    return true;
  } catch {
    return false;
  }
}

function createChannelTransporter(channel: SmtpChannel): Transporter {
  const existing = transporters[channel];
  if (existing) return existing;

  const { host, port, secure, user, pass } = getSmtpConfig(channel);
  const maxConnDefault = channel === 'marketing' ? 1 : 1;
  const rateDefault = channel === 'marketing' ? 2 : 3;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || maxConnDefault),
    maxMessages: Number(process.env.SMTP_MAX_MESSAGES || 40),
    rateDelta: Number(process.env.SMTP_RATE_DELTA_MS || 1000),
    rateLimit: Number(process.env.SMTP_RATE_LIMIT || rateDefault),
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 15000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 15000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 30000),
    tls: {
      rejectUnauthorized:
        String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false',
    },
  });

  transporters[channel] = transporter;
  return transporter;
}

/** @deprecated use createChannelTransporter — оставлен для скриптов */
export function createMailTransporter(): Transporter {
  return createChannelTransporter('transactional');
}

export function resetMailTransporter(channel?: SmtpChannel): void {
  const channels: SmtpChannel[] = channel ? [channel] : ['transactional', 'marketing'];
  for (const ch of channels) {
    const current = transporters[ch];
    transporters[ch] = undefined;
    if (current) {
      try {
        current.close();
      } catch {
        /* ignore */
      }
    }
  }
}

export function getConsecutiveSmtpFailures(): number {
  return consecutiveSendFailures;
}

/** Per-recipient ESP reject не должен копить burst-счётчик «очередь стоит». */
export function resetConsecutiveSmtpFailures(): void {
  consecutiveSendFailures = 0;
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

async function tripMarketingOnFatal(error: unknown, channel: SmtpChannel): Promise<void> {
  if (channel !== 'marketing') return;
  const quota = isProviderQuotaExhaustedError(error);
  const mailbox = isMailboxSendingDisabled(error);
  if (!quota && !mailbox) return;
  if (Date.now() - lastFatalTripAt < 10_000) return;
  lastFatalTripAt = Date.now();

  const reason = quota
    ? `Unisender Go: дневной лимит тарифа исчерпан: ${getSmtpErrorMessageSafe(error)}`
    : `Beget отключил отправку с ящика: ${getSmtpErrorMessageSafe(error)}`;
  try {
    await pauseMarketingMail(reason);
  } catch (e) {
    console.error('[email-transport] failed to persist marketing pause:', e);
  }
}

function getSmtpErrorMessageSafe(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

async function sendViaChannel(
  channel: SmtpChannel,
  mail: Parameters<Transporter['sendMail']>[0]
): Promise<void> {
  const transporter = createChannelTransporter(channel);
  try {
    await transporter.sendMail(mail);
    consecutiveSendFailures = 0;
  } catch (error) {
    consecutiveSendFailures += 1;
    if (isConnectionError(error)) {
      resetMailTransporter(channel);
    }
    await tripMarketingOnFatal(error, channel);
    throw error;
  }
}

/** OTP, алерты, транзакционные письма — всегда SMTP (Beget), не Unisender. */
export async function sendSimpleEmail(options: SendSimpleEmailOptions): Promise<void> {
  const { from, fromName } = getSmtpConfig('transactional');
  await sendViaChannel('transactional', {
    from: fromName ? `"${fromName}" <${from}>` : from,
    to: options.to,
    subject: options.subject,
    replyTo: from,
    text: options.text,
    html: options.html,
    headers: options.headers,
  });
}

/** Маркетинг / рассылки / цепочки — Unisender Go если задан API_UNISENDER_GO, иначе SMTP. */
export async function sendMarketingEmail(options: SendMarketingEmailOptions): Promise<void> {
  const htmlPrepared = normalizeHtmlForEmailSend(options.html);
  const { html: htmlWithCid, attachments: imageAttachments } = await embedMailImagesInHtml(htmlPrepared);
  const text = options.text || htmlToPlainText(htmlWithCid);

  if (isUnisenderGoConfigured()) {
    try {
      const inlineAttachments = imageAttachments.map((img: MailImageAttachment) => ({
        type: img.contentType,
        // Unisender: name = CID в cid:...
        name: img.cid,
        content: img.content.toString('base64'),
      }));

      await sendViaUnisenderGo({
        to: options.to,
        subject: options.subject,
        html: htmlWithCid,
        text,
        unsubscribeUrl: options.unsubscribeUrl,
        inlineAttachments,
        idempotenceKey: crypto.randomBytes(16).toString('hex'),
        metadata: {
          source: 'yasna-marketing',
          from: getUnisenderGoFromEmail(),
          from_name: getUnisenderGoFromName(),
        },
      });
      consecutiveSendFailures = 0;
      return;
    } catch (error) {
      consecutiveSendFailures += 1;
      await tripMarketingOnFatal(error, 'marketing');
      throw error;
    }
  }

  // Fallback: старый SMTP-маркетинг (если ключ Unisender не задан)
  const { from, fromName } = getSmtpConfig('marketing');

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

  await sendViaChannel('marketing', {
    from: fromName ? `"${fromName}" <${from}>` : from,
    to: options.to,
    subject: options.subject,
    replyTo: from,
    html: htmlWithCid,
    text,
    headers,
    attachments: inlineAttachments.length > 0 ? inlineAttachments : undefined,
  });
}

export function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  );
}
