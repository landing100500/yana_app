import { Op } from 'sequelize';
import User from '@/models/User';
import ChatTopic from '@/models/ChatTopic';
import Message from '@/models/Message';
import { getUserPlanSnapshot } from '@/lib/subscription';
import { userHasSucceededPayment } from '@/lib/plan-access';
import { formatReminderMessage, getReminderMessageByIndex } from '@/lib/reminder-messages';
import { getTariffsLinkMarkdown } from '@/lib/plan-messages';

const REMINDER_TOPIC_TITLE = 'Напоминание от Ясны';
const MIN_INTERVAL_MS = 23 * 60 * 60 * 1000;

async function sendReminderToUser(user: User): Promise<boolean> {
  const snapshot = getUserPlanSnapshot(user);
  if (snapshot.hasUnlimitedTime) return false;
  if (await userHasSucceededPayment(user.id)) return false;

  const dayIndex = Number((user as any).reminderDayIndex) || 0;
  const template = getReminderMessageByIndex(dayIndex);
  const body = `${formatReminderMessage(template, user.name)}\n\n${getTariffsLinkMarkdown('Открыть тарифы')}`;

  let topic = await ChatTopic.findOne({
    where: { userId: user.id, title: REMINDER_TOPIC_TITLE },
    order: [['updatedAt', 'DESC']],
  });

  if (!topic) {
    topic = await ChatTopic.create({
      userId: user.id,
      title: REMINDER_TOPIC_TITLE,
    });
  }

  await Message.create({
    topicId: topic.id,
    role: 'assistant',
    content: body,
  });

  (user as any).reminderLastSentAt = new Date();
  (user as any).reminderDayIndex = dayIndex + 1;
  await user.save();

  return true;
}

export async function runDailyReminders(): Promise<{ sent: number; skipped: number }> {
  const cutoff = new Date(Date.now() - MIN_INTERVAL_MS);

  const users = await User.findAll({
    where: {
      [Op.or]: [{ reminderLastSentAt: null }, { reminderLastSentAt: { [Op.lt]: cutoff } }],
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    try {
      const ok = await sendReminderToUser(user);
      if (ok) sent += 1;
      else skipped += 1;
    } catch (error) {
      console.error('Daily reminder failed for user', user.id, error);
      skipped += 1;
    }
  }

  return { sent, skipped };
}
