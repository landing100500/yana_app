import nodemailer from 'nodemailer';

export interface SendMarketingEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  unsubscribeUrl?: string;
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || user;
  const fromName = process.env.SMTP_FROM_NAME || 'YASNA';

  if (!host || !user || !pass || !from) {
    throw new Error('Email transport is not configured');
  }

  return { host, port, secure, user, pass, from, fromName };
}

export function createMailTransporter() {
  const { host, port, secure, user, pass } = getSmtpConfig();
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
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

export async function sendMarketingEmail(options: SendMarketingEmailOptions): Promise<void> {
  const { host, port, secure, user, pass, from, fromName } = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  const headers: Record<string, string> = {
    'X-Auto-Response-Suppress': 'All',
  };

  if (options.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${options.unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  await transporter.sendMail({
    from: fromName ? `"${fromName}" <${from}>` : from,
    to: options.to,
    subject: options.subject,
    replyTo: from,
    html: options.html,
    text: options.text || htmlToPlainText(options.html),
    headers,
  });
}

export function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  );
}
