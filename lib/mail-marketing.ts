import crypto from 'crypto';
import { Op } from 'sequelize';
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

export async function queueCampaign(campaignId: number): Promise<{ queued: number }> {
  const campaign = await MailCampaign.findByPk(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status !== 'draft' && campaign.status !== 'failed') {
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
}> {
  let sendsSent = 0;
  let sendsFailed = 0;
  let campaignsProcessed = 0;
  let sequencesProcessed = 0;

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
    const processed = await processSequenceEnrollment(enrollment.id);
    if (processed) sequencesProcessed++;
    await sleep(SEND_DELAY_MS);
  }

  return { campaignsProcessed, sendsSent, sendsFailed, sequencesProcessed };
}

function calculateNextSendAt(from: Date, step: MailSequenceStep): Date {
  const ms = (step.delayDays * 24 + step.delayHours) * 60 * 60 * 1000;
  return new Date(from.getTime() + ms);
}

export async function processSequenceEnrollment(enrollmentId: number): Promise<boolean> {
  const enrollment = await MailSequenceEnrollment.findByPk(enrollmentId);
  if (!enrollment || enrollment.status !== 'active') return false;

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

export async function enrollUserInSequence(userId: number, sequenceId: number): Promise<boolean> {
  const sequence = await MailSequence.findByPk(sequenceId);
  if (!sequence || !sequence.isActive) return false;

  const check = await isUserMailable(userId);
  if (!check.ok) return false;

  const steps = await MailSequenceStep.findAll({
    where: { sequenceId },
    order: [['stepOrder', 'ASC']],
  });
  if (steps.length === 0) return false;

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

  return created;
}

export async function enrollNewUserInActiveSequences(userId: number): Promise<number> {
  const sequences = await MailSequence.findAll({
    where: { isActive: true, triggerType: 'new_user' },
  });

  let enrolled = 0;
  for (const sequence of sequences) {
    const ok = await enrollUserInSequence(userId, sequence.id);
    if (ok) enrolled++;
  }
  return enrolled;
}

export async function enrollListInSequence(listId: number, sequenceId: number): Promise<number> {
  const members = await MailListMember.findAll({ where: { listId } });
  let enrolled = 0;
  for (const member of members) {
    const ok = await enrollUserInSequence(member.userId, sequenceId);
    if (ok) enrolled++;
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
