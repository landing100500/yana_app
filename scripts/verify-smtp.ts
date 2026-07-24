/**
 * Проверка SMTP на VPS/локально.
 * Загружает .env / .env.production / .env.local
 *
 * npx tsx scripts/verify-smtp.ts
 */
import fs from 'fs';
import path from 'path';
import { loadProjectEnvFiles, smtpEnvDiagnostics } from '../lib/load-project-env';

const loaded = loadProjectEnvFiles();
console.log('Env files loaded:', loaded.length ? loaded.join(', ') : '(none found)');
console.log(
  'Exists:',
  ['.env', '.env.production', '.env.local']
    .map((f) => `${f}=${fs.existsSync(path.join(process.cwd(), f)) ? 'yes' : 'no'}`)
    .join(', ')
);

const diag = smtpEnvDiagnostics();
console.log('SMTP env present:', diag.present);
if (diag.missing.length) {
  console.error('SMTP FAIL: missing', diag.missing.join(', '));
  console.error('Добавь SMTP_* в /var/www/yana_app/.env.production и перезапусти: pm2 restart yana_app --update-env');
  process.exit(1);
}

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
