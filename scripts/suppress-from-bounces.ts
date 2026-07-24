/**
 * Пометить suppressed подписчиков по уже накопленным failed mail_sends
 * (554 / local policy / icloud / user unknown).
 *
 * npx tsx scripts/suppress-from-bounces.ts
 */
import { Op } from 'sequelize';
import { loadProjectEnvFiles } from '../lib/load-project-env';

loadProjectEnvFiles();

async function main() {
  const { initDatabase } = await import('../lib/initDb');
  const MailSend = (await import('../models/MailSend')).default;
  const MailSubscriber = (await import('../models/MailSubscriber')).default;

  await initDatabase();

  const failed = await MailSend.findAll({
    where: {
      status: 'failed',
      errorMessage: {
        [Op.or]: [
          { [Op.like]: '%554%' },
          { [Op.like]: '%local policy%' },
          { [Op.like]: '%HM08%' },
          { [Op.like]: '%user unknown%' },
          { [Op.like]: '%mailbox unavailable%' },
          { [Op.like]: '%does not exist%' },
        ],
      },
    },
    attributes: ['userId', 'errorMessage'],
  });

  const byUser = new Map<number, string>();
  for (const row of failed) {
    if (!byUser.has(row.userId)) {
      byUser.set(row.userId, (row.errorMessage || 'bounce').slice(0, 500));
    }
  }

  let updated = 0;
  for (const [userId, reason] of Array.from(byUser.entries())) {
    const sub = await MailSubscriber.findOne({ where: { userId } });
    if (!sub || sub.suppressedAt) continue;
    await sub.update({ suppressedAt: new Date(), suppressReason: `hist:${reason}` });
    updated++;
  }

  console.log(`failed rows scanned=${failed.length}, users suppressed=${updated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
