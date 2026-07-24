/**
 * Проверка SMTP (реальное тестовое письмо на ADMIN_ALERTS_EMAIL или SMTP_FROM).
 * npx tsx scripts/verify-smtp.ts
 */
import fs from 'fs';
import path from 'path';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith("'") && val.endsWith("'")) ||
      (val.startsWith('"') && val.endsWith('"'))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

async function main() {
  const { createMailTransporter, getSmtpConfig, sendSimpleEmail, resetMailTransporter } = await import(
    '../lib/email-transport'
  );

  const cfg = getSmtpConfig();
  console.log('SMTP', { host: cfg.host, port: cfg.port, secure: cfg.secure, from: cfg.from });

  const transporter = createMailTransporter();
  console.log('verify...');
  await transporter.verify();
  console.log('verify OK');

  const to = process.env.ADMIN_ALERTS_EMAIL || cfg.from;
  console.log('send test to', to);
  await sendSimpleEmail({
    to,
    subject: '[YASNA] SMTP verify OK',
    text: `SMTP verify at ${new Date().toISOString()}`,
    html: `<p>SMTP verify at <b>${new Date().toISOString()}</b></p>`,
  });
  console.log('sent OK');
  resetMailTransporter();
}

main().catch((e) => {
  console.error('SMTP FAIL:', e);
  process.exit(1);
});
