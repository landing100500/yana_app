/**
 * Тестовая отправка через Unisender Go (без влияния на SMTP-цепочки приложения).
 *
 * Запуск:
 *   npx tsx scripts/unisender-go-test-send.ts --to direkt0001@yandex.ru
 *
 * Опционально:
 *   --from mail@yasna.chat
 *   --subject "Тест Unisender Go"
 */
import crypto from 'crypto';
import { loadProjectEnvFiles } from '../lib/load-project-env';

loadProjectEnvFiles();

type Args = {
  to: string;
  from?: string;
  subject?: string;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { to: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--to') out.to = String(argv[i + 1] || '').trim();
    if (a === '--from') out.from = String(argv[i + 1] || '').trim();
    if (a === '--subject') out.subject = String(argv[i + 1] || '').trim();
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.to) {
    throw new Error('Usage: npx tsx scripts/unisender-go-test-send.ts --to <email> [--from <email>] [--subject "..."]');
  }

  const apiKey = String(process.env.API_UNISENDER_GO || '').trim();
  if (!apiKey) {
    throw new Error('API_UNISENDER_GO не задан');
  }

  const endpoint =
    String(process.env.UNISENDER_GO_API_URL || 'https://goapi.unisender.ru/ru/transactional/api/v1')
      .replace(/\/+$/, '')
      + '/email/send.json';

  const fromEmail = args.from || String(process.env.UNISENDER_GO_FROM_EMAIL || process.env.SMTP_FROM || '').trim();
  if (!fromEmail) {
    throw new Error('Не найден from email. Укажите --from или UNISENDER_GO_FROM_EMAIL/SMTP_FROM');
  }
  const fromName = String(process.env.UNISENDER_GO_FROM_NAME || process.env.SMTP_FROM_NAME || 'YASNA').trim();
  const subject = args.subject || 'YASNA: тест Unisender Go';

  const textBody =
    'Это тестовое письмо Unisender Go от YASNA.\n\n' +
    'Если вы получили это письмо — API и домен настроены корректно.';
  const htmlBody =
    '<p>Это тестовое письмо <b>Unisender Go</b> от YASNA.</p>' +
    '<p>Если вы получили это письмо — API и домен настроены корректно.</p>';

  const idempotenceKey = crypto.randomBytes(16).toString('hex');
  const payload = {
    message: {
      recipients: [{ email: args.to }],
      subject,
      from_email: fromEmail,
      from_name: fromName,
      reply_to: fromEmail,
      reply_to_name: fromName,
      body: {
        html: htmlBody,
        plaintext: textBody,
      },
      track_links: 0,
      track_read: 0,
      idempotence_key: idempotenceKey,
      metadata: {
        source: 'script-unisender-go-test-send',
      },
    },
  };

  console.log('[unisender-go-test] endpoint:', endpoint);
  console.log('[unisender-go-test] to:', args.to);
  console.log('[unisender-go-test] from:', fromEmail);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

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

    if (!res.ok) {
      console.error('[unisender-go-test] HTTP error:', res.status, res.statusText);
      console.error('[unisender-go-test] body:', parsed);
      process.exit(2);
    }

    console.log('[unisender-go-test] OK:', parsed);
  } finally {
    clearTimeout(timeout);
  }
}

main().catch((e: any) => {
  const message = e?.message || String(e);
  console.error('[unisender-go-test] FAIL:', message);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});

