/**
 * Локальная проверка настроек рассылки (без отправки писем).
 * Запуск: npx tsx scripts/verify-mail-setup.ts
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

import { getAppBaseUrl } from '../lib/email-transport';
import { DEFAULT_MAIL_FOOTER_HTML, wrapEmailBody } from '../lib/mail-footer';
import { initDatabase } from '../lib/initDb';
import MailCampaign from '../models/MailCampaign';
import MailSequence from '../models/MailSequence';

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

function check(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  const icon = ok ? '✓' : '✗';
  console.log(`${icon} ${name}: ${detail}`);
}

async function main() {
  console.log('=== Проверка настроек рассылки ЯСНА ===\n');

  const appUrl = getAppBaseUrl();
  check('APP_URL', appUrl.includes('yasna.chat') || appUrl.includes('localhost'), appUrl);

  check('CRON_SECRET', !!process.env.CRON_SECRET, process.env.CRON_SECRET ? 'задан' : 'НЕ ЗАДАН');

  const smtpOk =
    !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASSWORD;
  check('SMTP', smtpOk, smtpOk ? `${process.env.SMTP_HOST}` : 'неполная конфигурация');

  check('API_GPT (spam-check)', !!process.env.API_GPT, process.env.API_GPT ? 'задан' : 'НЕ ЗАДАН');

  const sampleUnsub = `${appUrl}/unsubscribe?token=test-token-sample`;
  const wrapped = wrapEmailBody('<p>Тест</p>', DEFAULT_MAIL_FOOTER_HTML, sampleUnsub);
  check(
    'Unsubscribe URL в письме',
    wrapped.includes(sampleUnsub) && wrapped.includes('Отписаться'),
    sampleUnsub
  );

  try {
    await initDatabase();
    const campaigns = await MailCampaign.count();
    const sequences = await MailSequence.count();
    check('БД / таблицы рассылки', true, `campaigns=${campaigns}, sequences=${sequences}`);
  } catch (e) {
    check('БД / таблицы рассылки', false, e instanceof Error ? e.message : String(e));
  }

  console.log('\n=== Страницы ===');
  console.log(`Отписка: ${appUrl}/unsubscribe`);
  console.log(`Cron mail-queue: POST ${appUrl}/api/cron/mail-queue`);

  const failed = checks.filter((c) => !c.ok);
  console.log(`\nИтого: ${checks.length - failed.length}/${checks.length} OK`);
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
