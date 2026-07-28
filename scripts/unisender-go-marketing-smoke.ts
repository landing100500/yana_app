import { loadProjectEnvFiles } from '../lib/load-project-env';

loadProjectEnvFiles();

async function main() {
  const { isUnisenderGoConfigured, getUnisenderGoFromEmail } = await import('../lib/unisender-go');
  const { sendMarketingEmail, isSmtpConfigured } = await import('../lib/email-transport');
  const { mailQueueConfig } = await import('../lib/mail-queue-config');

  console.log('unisender configured:', isUnisenderGoConfigured());
  console.log('from:', getUnisenderGoFromEmail());
  console.log('smtp transactional:', isSmtpConfigured('transactional'));
  console.log('caps:', {
    daily: mailQueueConfig.dailySendCap,
    hourly: mailQueueConfig.hourlySendCap,
    delay: mailQueueConfig.broadcastDelayMs,
    queue: mailQueueConfig.queueLimit,
  });

  await sendMarketingEmail({
    to: 'direkt0001@yandex.ru',
    subject: 'YASNA: marketing via Unisender Go',
    html: '<p>Тест <b>sendMarketingEmail</b> через Unisender Go. OTP по-прежнему SMTP.</p>',
    unsubscribeUrl: 'https://yasna.chat/unsubscribe?token=test',
  });
  console.log('sendMarketingEmail OK');
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
