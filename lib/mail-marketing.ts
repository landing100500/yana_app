import crypto from 'crypto';
import { Op, Transaction } from 'sequelize';
import sequelize from '@/lib/db';
import User from '@/models/User';
import MailSubscriber from '@/models/MailSubscriber';
import MailListMember from '@/models/MailListMember';
import MailCampaign from '@/models/MailCampaign';
import MailSend from '@/models/MailSend';
import MailSequence from '@/models/MailSequence';
import MailSequenceStep from '@/models/MailSequenceStep';
import MailSequenceEnrollment from '@/models/MailSequenceEnrollment';
import { getUserPlanSnapshot } from '@/lib/subscription';
import { sendMarketingEmail, getAppBaseUrl } from '@/lib/email-transport';
import { getMailFooterHtml, wrapEmailBody } from '@/lib/mail-footer';

const BATCH_SIZE = 20;
const SEND_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateUnsubscribeToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function ensureMailSubscriber(userId: number, email: string): Promise<MailSubscriber> {
  const normalized = email.trim().toLowerCase();
  let subscriber = await MailSubscriber.findOne({ where: { userId } });
  if (subscriber) {
    if (subscriber.email !== normalized) {
      await subscriber.update({ email: normalized });
    }
    return subscriber;
  }

  subscriber = await MailSubscriber.create({
    userId,
    email: normalized,
    unsubscribeToken: generateUnsubscribeToken(),
    isSubscribed: true,
  });
  return subscriber;
}

export function getUnsubscribeUrl(token: string): string {
  return `${getAppBaseUrl()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

async function isUserMailable(userId: number): Promise<{ ok: boolean; email?: string; subscriber?: MailSubscriber }> {
  const user = await User.findByPk(userId);
  if (!user?.email || !user.password) {
    return { ok: false };
  }

  const subscriber = await ensureMailSubscriber(user.id, user.email);
  if (!subscriber.isSubscribed) {
    return { ok: false };
  }

  return { ok: true, email: user.email, subscriber };
}

export async function resolveCampaignRecipientIds(campaign: MailCampaign): Promise<number[]> {
  let userIds: number[] = [];

  if (campaign.audienceType === 'all') {
    const users = await User.findAll({
      where: {
        email: { [Op.ne]: null },
        password: { [Op.ne]: null },
      },
      attributes: ['id'],
    });
    userIds = users.map((u) => u.id);
  } else if (campaign.audienceType === 'plan' && campaign.audiencePlanCode) {
    const users = await User.findAll({
      where: {
        email: { [Op.ne]: null },
        password: { [Op.ne]: null },
      },
    });
    for (const user of users) {
      const snapshot = await getUserPlanSnapshot(user);
      if (snapshot.code === campaign.audiencePlanCode) {
        userIds.push(user.id);
      }
    }
  } else if (campaign.audienceType === 'list' && campaign.audienceListId) {
    const members = await MailListMember.findAll({
      where: { listId: campaign.audienceListId },
      attributes: ['userId'],
    });
    userIds = members.map((m) => m.userId);
  } else if (campaign.audienceType === 'previous_campaign' && campaign.previousCampaignId) {
    const sends = await MailSend.findAll({
      where: {
        campaignId: campaign.previousCampaignId,
        status: 'sent',
      },
      attributes: ['userId'],
    });
    userIds = Array.from(new Set(sends.map((s) => s.userId)));
  }

  const mailable: number[] = [];
  for (const userId of userIds) {
    const check = await isUserMailable(userId);
    if (check.ok) mailable.push(userId);
  }
  return mailable;
}

export function validateScheduledAt(scheduledAt: Date): void {
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error('Некорректная дата отправки');
  }
  if (scheduledAt.getTime() <= Date.now()) {
    throw new Error('Время отправки не может быть в прошлом');
  }
}

export async function scheduleCampaign(campaignId: number, scheduledAt: Date): Promise<MailCampaign> {
  validateScheduledAt(scheduledAt);

  const campaign = await MailCampaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status !== 'draft' && campaign.status !== 'failed') {
    throw new Error('Запланировать можно только черновик');
  }

  await campaign.update({ status: 'scheduled', scheduledAt });
  return campaign;
}

export async function processDueScheduledCampaigns(): Promise<number> {
  const due = await MailCampaign.findAll({
    where: {
      status: 'scheduled',
      scheduledAt: { [Op.lte]: new Date() },
    },
    order: [['scheduledAt', 'ASC']],
    limit: 10,
  });

  let activated = 0;
  for (const campaign of due) {
    await queueCampaign(campaign.id);
    activated++;
  }
  return activated;
}

export async function cancelScheduledCampaign(campaignId: number): Promise<void> {
  const campaign = await MailCampaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status !== 'scheduled') {
    throw new Error('Рассылка не запланирована');
  }
  await campaign.update({ status: 'draft', scheduledAt: null });
}

export async function deleteCampaignCompletely(campaignId: number): Promise<{ deletedSends: number }> {
  const campaign = await MailCampaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'sending' || campaign.status === 'queued') {
    throw new Error('Нельзя удалить рассылку во время отправки');
  }

  let deletedSends = 0;

  await sequelize.transaction(async (t: Transaction) => {
    deletedSends = await MailSend.destroy({ where: { campaignId }, transaction: t });

    await MailCampaign.update(
      { previousCampaignId: null, audienceType: 'all' },
      { where: { previousCampaignId: campaignId }, transaction: t }
    );

    await MailListMember.update(
      { sourceCampaignId: null, source: 'manual' },
      { where: { sourceCampaignId: campaignId }, transaction: t }
    );

    await campaign.destroy({ transaction: t });
  });

  return { deletedSends };
}

export async function queueCampaign(campaignId: number): Promise<{ queued: number }> {
  const campaign = await MailCampaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status !== 'draft' && campaign.status !== 'failed' && campaign.status !== 'scheduled') {
    throw new Error('Campaign already queued or sent');
  }

  const recipientIds = await resolveCampaignRecipientIds(campaign);
  const existing = await MailSend.findAll({
    where: { campaignId: campaign.id, status: { [Op.in]: ['pending', 'sent'] } },
    attributes: ['userId'],
  });
  const existingSet = new Set(existing.map((s) => s.userId));

  let queued = 0;
  for (const userId of recipientIds) {
    if (existingSet.has(userId)) continue;
    const check = await isUserMailable(userId);
    if (!check.ok || !check.email) continue;

    await MailSend.create({
      userId,
      email: check.email,
      campaignId: campaign.id,
      subject: campaign.subject,
      status: 'pending',
    });
    queued++;
  }

  await campaign.update({
    status: 'queued',
    totalRecipients: recipientIds.length,
    sentCount: 0,
    failedCount: 0,
  });

  return { queued };
}

export async function addCampaignRecipientsToList(campaignId: number, listId: number): Promise<number> {
  const sends = await MailSend.findAll({
    where: { campaignId, status: 'sent' },
    attributes: ['userId'],
  });

  let added = 0;
  for (const send of sends) {
    const [, created] = await MailListMember.findOrCreate({
      where: { listId, userId: send.userId },
      defaults: { listId, userId: send.userId, source: 'campaign', sourceCampaignId: campaignId },
    });
    if (created) added++;
  }
  return added;
}

async function sendOneMailSend(send: MailSend, htmlBody: string): Promise<boolean> {
  const check = await isUserMailable(send.userId);
  if (!check.ok || !check.subscriber || !check.email) {
    await send.update({ status: 'failed', errorMessage: 'User not mailable or unsubscribed' });
    return false;
  }

  const footer = await getMailFooterHtml();
  const unsubscribeUrl = getUnsubscribeUrl(check.subscriber.unsubscribeToken);
  const fullHtml = wrapEmailBody(htmlBody, footer, unsubscribeUrl);

  try {
    await sendMarketingEmail({
      to: check.email,
      subject: send.subject,
      html: fullHtml,
      unsubscribeUrl,
    });
    await send.update({ status: 'sent', sentAt: new Date(), email: check.email });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Send failed';
    await send.update({ status: 'failed', errorMessage: message });
    return false;
  }
}

export async function processMailQueue(limit = BATCH_SIZE): Promise<{
  campaignsProcessed: number;
  sendsSent: number;
  sendsFailed: number;
  sequencesProcessed: number;
  scheduledActivated: number;
}> {
  let sendsSent = 0;
  let sendsFailed = 0;
  let campaignsProcessed = 0;
  let sequencesProcessed = 0;

  const scheduledActivated = await processDueScheduledCampaigns();

  const pendingSends = await MailSend.findAll({
    where: { status: 'pending' },
    order: [['createdAt', 'ASC']],
    limit,
  });

  for (const send of pendingSends) {
    let htmlBody = '';

    if (send.campaignId) {
      const campaign = await MailCampaign.findByPk(send.campaignId);
      if (!campaign) {
        await send.update({ status: 'failed', errorMessage: 'Campaign not found' });
        sendsFailed++;
        continue;
      }
      if (campaign.status === 'queued') {
        await campaign.update({ status: 'sending' });
      }
      htmlBody = campaign.htmlBody;
    } else if (send.sequenceStepId) {
      const step = await MailSequenceStep.findByPk(send.sequenceStepId);
      if (!step) {
        await send.update({ status: 'failed', errorMessage: 'Sequence step not found' });
        sendsFailed++;
        continue;
      }
      htmlBody = step.htmlBody;
    } else {
      await send.update({ status: 'failed', errorMessage: 'No content source' });
      sendsFailed++;
      continue;
    }

    const ok = await sendOneMailSend(send, htmlBody);
    if (ok) sendsSent++;
    else sendsFailed++;

    if (send.campaignId) {
      const campaign = await MailCampaign.findByPk(send.campaignId);
      if (campaign) {
        const pendingCount = await MailSend.count({
          where: { campaignId: campaign.id, status: 'pending' },
        });
        const sentCount = await MailSend.count({
          where: { campaignId: campaign.id, status: 'sent' },
        });
        const failedCount = await MailSend.count({
          where: { campaignId: campaign.id, status: 'failed' },
        });
        await campaign.update({
          sentCount,
          failedCount,
          status: pendingCount === 0 ? 'sent' : 'sending',
          sentAt: pendingCount === 0 ? new Date() : campaign.sentAt,
        });
        if (pendingCount === 0) campaignsProcessed++;
      }
    }

    await sleep(SEND_DELAY_MS);
  }

  const dueEnrollments = await MailSequenceEnrollment.findAll({
    where: {
      status: 'active',
      nextSendAt: { [Op.lte]: new Date() },
    },
    limit: Math.max(1, Math.floor(limit / 2)),
  });

  for (const enrollment of dueEnrollments) {
    const sequence = await MailSequence.findByPk(enrollment.sequenceId);
    if (!sequence?.isActive || !sequence.launchedAt) continue;

    const processed = await processSequenceEnrollment(enrollment.id);
    if (processed) sequencesProcessed++;
    await sleep(SEND_DELAY_MS);
  }

  return { campaignsProcessed, sendsSent, sendsFailed, sequencesProcessed, scheduledActivated };
}

function calculateNextSendAt(from: Date, step: MailSequenceStep): Date {
  const ms = (step.delayDays * 24 + step.delayHours) * 60 * 60 * 1000;
  return new Date(from.getTime() + ms);
}

export async function processSequenceEnrollment(enrollmentId: number): Promise<boolean> {
  const enrollment = await MailSequenceEnrollment.findByPk(enrollmentId);
  if (!enrollment || enrollment.status !== 'active') return false;

  const sequence = await MailSequence.findByPk(enrollment.sequenceId);
  if (!sequence?.isActive || !sequence.launchedAt) return false;

  const check = await isUserMailable(enrollment.userId);
  if (!check.ok) {
    await enrollment.update({ status: 'unsubscribed' });
    return false;
  }

  const steps = await MailSequenceStep.findAll({
    where: { sequenceId: enrollment.sequenceId },
    order: [['stepOrder', 'ASC']],
  });
  if (steps.length === 0) {
    await enrollment.update({ status: 'completed', completedAt: new Date(), nextSendAt: null });
    return false;
  }

  const nextStepOrder = enrollment.currentStepOrder + 1;
  const step = steps.find((s) => s.stepOrder === nextStepOrder);
  if (!step) {
    await enrollment.update({ status: 'completed', completedAt: new Date(), nextSendAt: null });
    return false;
  }

  const alreadySent = await MailSend.findOne({
    where: {
      enrollmentId: enrollment.id,
      sequenceStepId: step.id,
      status: { [Op.in]: ['pending', 'sent'] },
    },
  });
  if (alreadySent) {
    const following = steps.find((s) => s.stepOrder === nextStepOrder + 1);
    await enrollment.update({
      currentStepOrder: nextStepOrder,
      nextSendAt: following ? calculateNextSendAt(new Date(), following) : null,
      status: following ? 'active' : 'completed',
      completedAt: following ? null : new Date(),
    });
    return false;
  }

  const send = await MailSend.create({
    userId: enrollment.userId,
    email: check.email!,
    sequenceStepId: step.id,
    enrollmentId: enrollment.id,
    subject: step.subject,
    status: 'pending',
  });

  const ok = await sendOneMailSend(send, step.htmlBody);
  if (!ok) return true;

  const following = steps.find((s) => s.stepOrder === nextStepOrder + 1);
  await enrollment.update({
    currentStepOrder: nextStepOrder,
    nextSendAt: following ? calculateNextSendAt(new Date(), following) : null,
    status: following ? 'active' : 'completed',
    completedAt: following ? null : new Date(),
  });

  return true;
}

export type EnrollUserResult = 'enrolled' | 'already' | 'not_mailable' | 'no_steps';

export async function enrollUserInSequence(userId: number, sequenceId: number): Promise<EnrollUserResult> {
  const steps = await MailSequenceStep.findAll({
    where: { sequenceId },
    order: [['stepOrder', 'ASC']],
  });
  if (steps.length === 0) return 'no_steps';

  const check = await isUserMailable(userId);
  if (!check.ok) return 'not_mailable';

  const firstStep = steps[0];
  const nextSendAt = calculateNextSendAt(new Date(), firstStep);

  const [, created] = await MailSequenceEnrollment.findOrCreate({
    where: { sequenceId, userId },
    defaults: {
      sequenceId,
      userId,
      currentStepOrder: 0,
      nextSendAt,
      status: 'active',
      enrolledAt: new Date(),
    },
  });

  return created ? 'enrolled' : 'already';
}

export async function processDueEnrollmentsForSequence(sequenceId: number): Promise<number> {
  const enrollments = await MailSequenceEnrollment.findAll({
    where: {
      sequenceId,
      status: 'active',
      nextSendAt: { [Op.lte]: new Date() },
    },
    limit: 50,
  });

  let processed = 0;
  for (const enrollment of enrollments) {
    const ok = await processSequenceEnrollment(enrollment.id);
    if (ok) processed++;
    await sleep(SEND_DELAY_MS);
  }
  return processed;
}

export interface SequenceStats {
  enrollments: {
    total: number;
    active: number;
    completed: number;
    unsubscribed: number;
    cancelled: number;
  };
  sends: { sent: number; pending: number; failed: number };
  steps: Array<{
    stepOrder: number;
    subject: string;
    sent: number;
    pending: number;
    failed: number;
  }>;
}

export async function repairLegacySequenceLaunch(sequence: MailSequence): Promise<MailSequence> {
  if (sequence.launchedAt) return sequence;

  const enrollmentCount = await MailSequenceEnrollment.count({ where: { sequenceId: sequence.id } });
  if (enrollmentCount === 0) return sequence;

  const first = await MailSequenceEnrollment.findOne({
    where: { sequenceId: sequence.id },
    order: [['enrolledAt', 'ASC']],
  });

  await sequence.update({
    launchedAt: first?.enrolledAt || new Date(),
    isActive: true,
  });
  await sequence.reload();
  return sequence;
}

export async function getSequenceStats(sequenceId: number): Promise<SequenceStats> {
  const enrollments = await MailSequenceEnrollment.findAll({
    where: { sequenceId },
    attributes: ['id', 'status'],
  });
  const enrollmentIds = enrollments.map((e) => e.id);

  const sends =
    enrollmentIds.length > 0
      ? await MailSend.findAll({
          where: { enrollmentId: enrollmentIds },
          attributes: ['status', 'sequenceStepId'],
        })
      : [];

  const steps = await MailSequenceStep.findAll({
    where: { sequenceId },
    order: [['stepOrder', 'ASC']],
    attributes: ['id', 'stepOrder', 'subject'],
  });

  const countByStatus = (status: string) => enrollments.filter((e) => e.status === status).length;
  const countSends = (status: string) => sends.filter((s) => s.status === status).length;

  return {
    enrollments: {
      total: enrollments.length,
      active: countByStatus('active'),
      completed: countByStatus('completed'),
      unsubscribed: countByStatus('unsubscribed'),
      cancelled: countByStatus('cancelled'),
    },
    sends: {
      sent: countSends('sent'),
      pending: countSends('pending'),
      failed: countSends('failed'),
    },
    steps: steps.map((step) => {
      const stepSends = sends.filter((s) => s.sequenceStepId === step.id);
      return {
        stepOrder: step.stepOrder,
        subject: step.subject,
        sent: stepSends.filter((s) => s.status === 'sent').length,
        pending: stepSends.filter((s) => s.status === 'pending').length,
        failed: stepSends.filter((s) => s.status === 'failed').length,
      };
    }),
  };
}

export interface LaunchSequenceResult {
  enrolled: number;
  alreadyEnrolled: number;
  notMailable: number;
  immediateSent: number;
}

export async function launchSequenceOnList(listId: number, sequenceId: number): Promise<LaunchSequenceResult> {
  const sequence = await MailSequence.findByPk(sequenceId);
  if (!sequence) throw new Error('Цепочка не найдена');
  if (sequence.launchedAt) throw new Error('Цепочка уже запущена');
  if (sequence.triggerType === 'new_user') {
    throw new Error('Для цепочки «Новые пользователи» используйте кнопку «Включить»');
  }

  const stepCount = await MailSequenceStep.count({ where: { sequenceId } });
  if (stepCount === 0) throw new Error('Добавьте хотя бы одно письмо в цепочку');

  const members = await MailListMember.findAll({ where: { listId } });
  if (members.length === 0) throw new Error('Список пуст');

  let enrolled = 0;
  let alreadyEnrolled = 0;
  let notMailable = 0;

  await sequence.update({ isActive: true, launchedAt: new Date(), launchListId: listId });

  for (const member of members) {
    const result = await enrollUserInSequence(member.userId, sequenceId);
    if (result === 'enrolled') enrolled++;
    else if (result === 'already') alreadyEnrolled++;
    else if (result === 'not_mailable') notMailable++;
  }

  const immediateSent = await processDueEnrollmentsForSequence(sequenceId);

  return { enrolled, alreadyEnrolled, notMailable, immediateSent };
}

export async function enableSequenceForNewUsers(sequenceId: number): Promise<void> {
  const sequence = await MailSequence.findByPk(sequenceId);
  if (!sequence) throw new Error('Цепочка не найдена');
  if (sequence.triggerType !== 'new_user') {
    throw new Error('Включение доступно только для цепочек «Новые пользователи»');
  }
  if (sequence.launchedAt) throw new Error('Цепочка уже включена');

  const stepCount = await MailSequenceStep.count({ where: { sequenceId } });
  if (stepCount === 0) throw new Error('Добавьте хотя бы одно письмо в цепочку');

  await sequence.update({ isActive: true, launchedAt: new Date() });
}

export async function setSequencePaused(sequenceId: number, paused: boolean): Promise<void> {
  const sequence = await MailSequence.findByPk(sequenceId);
  if (!sequence) throw new Error('Цепочка не найдена');
  if (!sequence.launchedAt) throw new Error('Сначала запустите цепочку');

  await sequence.update({ isActive: !paused });
}

export async function enrollNewUserInActiveSequences(userId: number): Promise<number> {
  const sequences = await MailSequence.findAll({
    where: { isActive: true, triggerType: 'new_user', launchedAt: { [Op.ne]: null } },
  });

  let enrolled = 0;
  for (const sequence of sequences) {
    const result = await enrollUserInSequence(userId, sequence.id);
    if (result === 'enrolled') {
      enrolled++;
      await processDueEnrollmentsForSequence(sequence.id);
    }
  }
  return enrolled;
}

export async function unsubscribeByToken(token: string): Promise<{ ok: boolean; email?: string }> {
  const subscriber = await MailSubscriber.findOne({ where: { unsubscribeToken: token } });
  if (!subscriber) return { ok: false };

  if (!subscriber.isSubscribed) {
    return { ok: true, email: subscriber.email };
  }

  await subscriber.update({ isSubscribed: false, unsubscribedAt: new Date() });

  await MailSequenceEnrollment.update(
    { status: 'unsubscribed' },
    { where: { userId: subscriber.userId, status: 'active' } }
  );

  return { ok: true, email: subscriber.email };
}

export async function resubscribeByToken(token: string): Promise<boolean> {
  const subscriber = await MailSubscriber.findOne({ where: { unsubscribeToken: token } });
  if (!subscriber) return false;
  await subscriber.update({ isSubscribed: true, unsubscribedAt: null });
  return true;
}

export async function getSubscriberByToken(token: string): Promise<MailSubscriber | null> {
  return MailSubscriber.findOne({ where: { unsubscribeToken: token } });
}
