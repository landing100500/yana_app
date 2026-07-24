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
import { getUserPlanSnapshot, normalizePlanCode } from '@/lib/subscription';
import { sendMarketingEmail, getAppBaseUrl, getConsecutiveSmtpFailures } from '@/lib/email-transport';
import { alertAdminAsync } from '@/lib/admin-alerts';
import { getMailFooterHtml, wrapEmailBody } from '@/lib/mail-footer';
import { mailQueueConfig } from '@/lib/mail-queue-config';
import { assertMarketingSendAllowed, isMarketingMailPaused } from '@/lib/mail-send-guard';
import { isFatalSmtpProviderError, isPermanentRecipientBounce } from '@/lib/smtp-errors';
import { validateEmailForSending } from '@/lib/email-validation';
import type { MailCampaignStatus } from '@/models/MailCampaign';
import {
  applyPlanPurchaseExclusions,
  cancelEnrollmentForExclusion,
  getSequenceTriggerPlanCodes,
  isUserExcludedFromSequence,
} from '@/lib/mail-sequence-rules';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let backgroundMailQueueRunning = false;
let lastSmtpBurstAlertAt = 0;

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
  if (!subscriber.isSubscribed || subscriber.suppressedAt) {
    return { ok: false };
  }

  const validation = await validateEmailForSending(user.email);
  if (!validation.ok) {
    await suppressMailSubscriber(user.id, `precheck:${validation.reason || 'invalid'}`);
    return { ok: false };
  }

  return { ok: true, email: user.email, subscriber };
}

export async function suppressMailSubscriber(
  userId: number,
  reason: string
): Promise<void> {
  const subscriber = await MailSubscriber.findOne({ where: { userId } });
  if (!subscriber || subscriber.suppressedAt) return;
  await subscriber.update({
    suppressedAt: new Date(),
    suppressReason: reason.slice(0, 500),
  });
}

/** Пакетная проверка подписки — без N отдельных запросов при большой аудитории */
async function filterMailableRecipients(
  userIds: number[]
): Promise<Array<{ userId: number; email: string }>> {
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) return [];

  const users = await User.findAll({
    where: {
      id: uniqueIds,
      email: { [Op.ne]: null },
      password: { [Op.ne]: null },
    },
    attributes: ['id', 'email'],
  });
  if (users.length === 0) return [];

  const subscribers = await MailSubscriber.findAll({
    where: { userId: users.map((u) => u.id) },
  });
  const subByUser = new Map(subscribers.map((s) => [s.userId, s]));

  const result: Array<{ userId: number; email: string }> = [];
  for (const user of users) {
    const email = user.email!.trim();
    let subscriber = subByUser.get(user.id);
    if (!subscriber) {
      subscriber = await ensureMailSubscriber(user.id, email);
      subByUser.set(user.id, subscriber);
    } else if (subscriber.email !== email.toLowerCase()) {
      await subscriber.update({ email: email.toLowerCase() });
    }
    if (!subscriber.isSubscribed || subscriber.suppressedAt) continue;

    const validation = await validateEmailForSending(email);
    if (!validation.ok) {
      await suppressMailSubscriber(user.id, `precheck:${validation.reason || 'invalid'}`);
      continue;
    }
    result.push({ userId: user.id, email });
  }
  return result;
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

  return Array.from(new Set(userIds));
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
  if (
    campaign.status !== 'draft' &&
    campaign.status !== 'failed' &&
    campaign.status !== 'scheduled'
  ) {
    throw new Error('Campaign already queued or sent');
  }

  const recipientIds = await resolveCampaignRecipientIds(campaign);
  const mailable = await filterMailableRecipients(recipientIds);

  const existing = await MailSend.findAll({
    where: { campaignId: campaign.id, status: { [Op.in]: ['pending', 'sent'] } },
    attributes: ['userId'],
  });
  const existingSet = new Set(existing.map((s) => s.userId));

  const rows: Array<{
    userId: number;
    email: string;
    campaignId: number;
    subject: string;
    status: 'pending';
  }> = [];

  for (const { userId, email } of mailable) {
    if (existingSet.has(userId)) continue;
    rows.push({
      userId,
      email,
      campaignId: campaign.id,
      subject: campaign.subject,
      status: 'pending',
    });
  }

  let queued = 0;
  const batchSize = mailQueueConfig.queueInsertBatchSize;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const created = await MailSend.bulkCreate(chunk, { ignoreDuplicates: true });
    queued += created.length;
  }

  await campaign.update({
    status: queued > 0 || existing.length > 0 ? 'sending' : 'failed',
    totalRecipients: recipientIds.length,
    sentCount: await MailSend.count({ where: { campaignId: campaign.id, status: 'sent' } }),
    failedCount: await MailSend.count({ where: { campaignId: campaign.id, status: 'failed' } }),
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

type SendOneResult = 'sent' | 'failed' | 'skipped';

async function sendOneMailSend(send: MailSend, htmlBody: string): Promise<SendOneResult> {
  const allow = await assertMarketingSendAllowed();
  if (!allow.ok) {
    // pending остаётся — не жжём получателей при паузе/дневном лимите
    return 'skipped';
  }

  const check = await isUserMailable(send.userId);
  if (!check.ok || !check.subscriber || !check.email) {
    await send.update({ status: 'failed', errorMessage: 'User not mailable or unsubscribed' });
    return 'failed';
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
    return 'sent';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Send failed';
    await send.update({ status: 'failed', errorMessage: message });
    if (isPermanentRecipientBounce(error)) {
      await suppressMailSubscriber(send.userId, message);
    }
    if (isFatalSmtpProviderError(error)) {
      // pause уже выставлен в email-transport; дальше очередь должна остановиться
      return 'failed';
    }
    const fails = getConsecutiveSmtpFailures();
    if (fails >= 3 && Date.now() - lastSmtpBurstAlertAt > 5 * 60 * 1000) {
      lastSmtpBurstAlertAt = Date.now();
      alertAdminAsync({
        source: 'mail/sendOne',
        severity: 'critical',
        title: 'SMTP: серия ошибок отправки рассылки',
        detail: `Подряд неудачных отправок: ${fails}. Очередь может стоять.`,
        meta: { sendId: send.id, email: send.email || check.email || null },
        error,
        dedupeMs: 5 * 60 * 1000,
      });
    }
    return 'failed';
  }
}

async function refreshCampaignCounters(campaignId: number): Promise<MailCampaign | null> {
  const campaign = await MailCampaign.findByPk(campaignId);
  if (!campaign) return null;

  const sentCount = await MailSend.count({ where: { campaignId, status: 'sent' } });
  const failedCount = await MailSend.count({ where: { campaignId, status: 'failed' } });
  const pendingCount = await MailSend.count({ where: { campaignId, status: 'pending' } });

  let status: MailCampaignStatus = campaign.status;
  let sentAt = campaign.sentAt;

  if (pendingCount === 0 && (sentCount > 0 || failedCount > 0)) {
    if (sentCount === 0) status = 'failed';
    else if (failedCount > 0) status = 'partial';
    else status = 'sent';
    sentAt = sentAt || new Date();
  } else if (pendingCount > 0 && campaign.status !== 'scheduled' && campaign.status !== 'draft') {
    status = 'sending';
  }

  await campaign.update({ sentCount, failedCount, status, sentAt });
  return campaign;
}

async function processBroadcastChunk(campaign: MailCampaign, chunkLimit: number): Promise<{
  sent: number;
  failed: number;
  completed: boolean;
}> {
  let sent = 0;
  let failed = 0;

  const pendingSends = await MailSend.findAll({
    where: { campaignId: campaign.id, status: 'pending' },
    order: [['id', 'ASC']],
    limit: chunkLimit,
  });

  for (const send of pendingSends) {
    if (await isMarketingMailPaused()) break;
    const result = await sendOneMailSend(send, campaign.htmlBody);
    if (result === 'skipped') break;
    if (result === 'sent') sent++;
    else failed++;
    await sleep(mailQueueConfig.broadcastDelayMs);
  }

  const updated = await refreshCampaignCounters(campaign.id);
  const pendingLeft = await MailSend.count({ where: { campaignId: campaign.id, status: 'pending' } });
  const completed =
    pendingLeft === 0 &&
    !!updated &&
    (updated.status === 'sent' || updated.status === 'partial' || updated.status === 'failed');

  return { sent, failed, completed };
}

async function processSequencePendingSends(limit: number): Promise<number> {
  const pending = await MailSend.findAll({
    where: {
      status: 'pending',
      sequenceStepId: { [Op.ne]: null },
      campaignId: null,
    },
    order: [['createdAt', 'ASC']],
    limit,
  });

  let processed = 0;
  for (const send of pending) {
    if (await isMarketingMailPaused()) break;
    const step = await MailSequenceStep.findByPk(send.sequenceStepId!);
    if (!step) {
      await send.update({ status: 'failed', errorMessage: 'Sequence step not found' });
      continue;
    }
    const result = await sendOneMailSend(send, step.htmlBody);
    if (result === 'skipped') break;
    if (result === 'sent') processed++;
    await sleep(mailQueueConfig.sequenceDelayMs);
  }
  return processed;
}

/** Фоновая обработка после клика «Отправить» — не блокирует HTTP */
export function kickBackgroundMailQueue(): void {
  if (backgroundMailQueueRunning) return;
  backgroundMailQueueRunning = true;
  void runBackgroundMailQueue().finally(() => {
    backgroundMailQueueRunning = false;
  });
}

async function runBackgroundMailQueue(): Promise<void> {
  const deadline = Date.now() + mailQueueConfig.backgroundRunSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      const result = await processMailQueue();
      const pendingLeft = await MailSend.count({ where: { status: 'pending' } });
      if (
        result.sendsSent === 0 &&
        result.sequencesProcessed === 0 &&
        result.scheduledActivated === 0 &&
        pendingLeft === 0
      ) {
        break;
      }
      if (result.blockedReason || (await isMarketingMailPaused())) {
        break;
      }
      if (result.sendsSent === 0 && result.sendsFailed > 0 && getConsecutiveSmtpFailures() >= 5) {
        alertAdminAsync({
          source: 'mail/background-queue',
          severity: 'critical',
          title: 'Фоновая очередь писем остановлена: SMTP недоступен',
          detail: `failed=${result.sendsFailed}, consecutiveFailures=${getConsecutiveSmtpFailures()}`,
          dedupeMs: 10 * 60 * 1000,
        });
        break;
      }
    } catch (error) {
      console.error('Background mail queue error:', error);
      alertAdminAsync({
        source: 'mail/background-queue',
        severity: 'critical',
        title: 'Фоновая очередь писем: падение',
        error,
      });
      break;
    }
    await sleep(300);
  }
}

export async function processMailQueue(limit?: number): Promise<{
  campaignsProcessed: number;
  sendsSent: number;
  sendsFailed: number;
  sequencesProcessed: number;
  scheduledActivated: number;
  blockedReason?: string;
}> {
  const cfg = mailQueueConfig;
  const allow = await assertMarketingSendAllowed();
  if (!allow.ok) {
    return {
      campaignsProcessed: 0,
      sendsSent: 0,
      sendsFailed: 0,
      sequencesProcessed: 0,
      scheduledActivated: 0,
      blockedReason: allow.reason,
    };
  }

  const totalLimit = limit ?? cfg.queueLimit;
  const budgetCap = Math.min(totalLimit, allow.remaining ?? totalLimit);
  const broadcastBudget = Math.max(1, Math.floor(budgetCap * cfg.broadcastBudgetRatio));
  const sequenceBudget = Math.max(1, budgetCap - broadcastBudget);

  let sendsSent = 0;
  let sendsFailed = 0;
  let campaignsProcessed = 0;
  let sequencesProcessed = 0;

  const scheduledActivated = await processDueScheduledCampaigns();

  const activeCampaigns = await MailCampaign.findAll({
    where: { status: { [Op.in]: ['queued', 'sending'] } },
    order: [['updatedAt', 'ASC']],
  });

  let broadcastOps = 0;
  for (const campaign of activeCampaigns) {
    if (broadcastOps >= broadcastBudget) break;

    const chunkLimit = Math.min(cfg.broadcastChunkSize, broadcastBudget - broadcastOps);
    const { sent, failed, completed } = await processBroadcastChunk(campaign, chunkLimit);
    sendsSent += sent;
    sendsFailed += failed;
    broadcastOps += sent + failed;
    if (completed) campaignsProcessed++;
  }

  // Оставшиеся pending без привязки к активной кампании (legacy / sequence retries)
  const orphanBudget = Math.max(0, broadcastBudget - broadcastOps);
  if (orphanBudget > 0) {
    const orphanSends = await MailSend.findAll({
      where: {
        status: 'pending',
        campaignId: { [Op.ne]: null },
      },
      order: [['createdAt', 'ASC']],
      limit: orphanBudget,
    });

    for (const send of orphanSends) {
      if (await isMarketingMailPaused()) break;
      const campaign = await MailCampaign.findByPk(send.campaignId!);
      if (!campaign || (campaign.status !== 'queued' && campaign.status !== 'sending')) continue;
      const result = await sendOneMailSend(send, campaign.htmlBody);
      if (result === 'skipped') break;
      if (result === 'sent') sendsSent++;
      else sendsFailed++;
      await refreshCampaignCounters(campaign.id);
      await sleep(cfg.broadcastDelayMs);
    }
  }

  const sequencePendingSent = await processSequencePendingSends(Math.min(5, sequenceBudget));
  sendsSent += sequencePendingSent;

  const dueEnrollments = await MailSequenceEnrollment.findAll({
    where: {
      status: 'active',
      nextSendAt: { [Op.lte]: new Date() },
    },
    order: [['nextSendAt', 'ASC']],
    limit: sequenceBudget,
  });

  for (const enrollment of dueEnrollments) {
    if (await isMarketingMailPaused()) break;
    const sequence = await MailSequence.findByPk(enrollment.sequenceId);
    if (!sequence?.isActive || !sequence.launchedAt) continue;

    const processed = await processSequenceEnrollment(enrollment.id);
    if (processed) sequencesProcessed++;
    await sleep(cfg.sequenceDelayMs);
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

  if (await isUserExcludedFromSequence(enrollment.userId, sequence)) {
    await cancelEnrollmentForExclusion(enrollment.id);
    return false;
  }

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

  const result = await sendOneMailSend(send, step.htmlBody);
  if (result === 'skipped') return false;
  if (result !== 'sent') return true;

  const following = steps.find((s) => s.stepOrder === nextStepOrder + 1);
  await enrollment.update({
    currentStepOrder: nextStepOrder,
    nextSendAt: following ? calculateNextSendAt(new Date(), following) : null,
    status: following ? 'active' : 'completed',
    completedAt: following ? null : new Date(),
  });

  return true;
}

export type EnrollUserResult = 'enrolled' | 'already' | 'not_mailable' | 'no_steps' | 'excluded';

export async function enrollUserInSequence(userId: number, sequenceId: number): Promise<EnrollUserResult> {
  const sequence = await MailSequence.findByPk(sequenceId);
  if (!sequence) return 'no_steps';

  if (await isUserExcludedFromSequence(userId, sequence)) {
    return 'excluded';
  }

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
    await sleep(mailQueueConfig.sequenceDelayMs);
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
  sends: { sent: number; pending: number; failed: number; sentToday: number };
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

  let sentToday = 0;
  if (enrollmentIds.length > 0) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    sentToday = await MailSend.count({
      where: {
        enrollmentId: enrollmentIds,
        status: 'sent',
        sentAt: { [Op.gte]: startOfToday },
      },
    });
  }

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
      sentToday,
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

async function resolveRegisteredUserIds(): Promise<number[]> {
  const users = await User.findAll({
    where: {
      email: { [Op.ne]: null },
      password: { [Op.ne]: null },
    },
    attributes: ['id'],
  });
  return users.map((u) => u.id);
}

async function launchSequenceForUserIds(
  sequence: MailSequence,
  userIds: number[],
  launchListId: number | null
): Promise<LaunchSequenceResult> {
  if (userIds.length === 0) throw new Error('Нет пользователей для запуска');

  const steps = await MailSequenceStep.findAll({
    where: { sequenceId: sequence.id },
    order: [['stepOrder', 'ASC']],
  });
  const firstStep = steps[0];
  const nextSendAt = calculateNextSendAt(new Date(), firstStep);

  await sequence.update({ isActive: true, launchedAt: new Date(), launchListId });

  const mailable = await filterMailableRecipients(userIds);
  const eligible: Array<{ userId: number; email: string }> = [];
  for (const m of mailable) {
    if (!(await isUserExcludedFromSequence(m.userId, sequence))) {
      eligible.push(m);
    }
  }

  const existing = await MailSequenceEnrollment.findAll({
    where: { sequenceId: sequence.id, userId: eligible.map((m) => m.userId) },
    attributes: ['userId'],
  });
  const existingSet = new Set(existing.map((e) => e.userId));

  const enrollRows = eligible
    .filter((m) => !existingSet.has(m.userId))
    .map((m) => ({
      sequenceId: sequence.id,
      userId: m.userId,
      currentStepOrder: 0,
      nextSendAt,
      status: 'active' as const,
      enrolledAt: new Date(),
    }));

  let enrolled = 0;
  const batchSize = mailQueueConfig.queueInsertBatchSize;
  for (let i = 0; i < enrollRows.length; i += batchSize) {
    const chunk = enrollRows.slice(i, i + batchSize);
    const created = await MailSequenceEnrollment.bulkCreate(chunk, { ignoreDuplicates: true });
    enrolled += created.length;
  }

  return {
    enrolled,
    alreadyEnrolled: eligible.length - enrolled,
    notMailable: userIds.length - eligible.length,
    immediateSent: 0,
  };
}

async function assertOneShotSequenceReady(
  sequenceId: number,
  expected: 'manual' | 'all_users'
): Promise<MailSequence> {
  const sequence = await MailSequence.findByPk(sequenceId);
  if (!sequence) throw new Error('Цепочка не найдена');
  if (sequence.launchedAt) throw new Error('Цепочка уже запущена');

  const type = sequence.triggerType === 'none' ? 'manual' : sequence.triggerType;
  if (type !== expected) {
    if (expected === 'manual') {
      throw new Error('Для запуска по списку выберите триггер «По списку»');
    }
    throw new Error('Для запуска на всех выберите триггер «Все зарегистрированные»');
  }

  const stepCount = await MailSequenceStep.count({ where: { sequenceId } });
  if (stepCount === 0) throw new Error('Добавьте хотя бы одно письмо в цепочку');

  return sequence;
}

export async function launchSequenceOnList(listId: number, sequenceId: number): Promise<LaunchSequenceResult> {
  const sequence = await assertOneShotSequenceReady(sequenceId, 'manual');
  const members = await MailListMember.findAll({ where: { listId }, attributes: ['userId'] });
  if (members.length === 0) throw new Error('Список пуст');
  return launchSequenceForUserIds(
    sequence,
    members.map((m) => m.userId),
    listId
  );
}

/** Одноразовый запуск цепочки на всех зарегистрированных (email + пароль). */
export async function launchSequenceOnAllUsers(sequenceId: number): Promise<LaunchSequenceResult> {
  const sequence = await assertOneShotSequenceReady(sequenceId, 'all_users');
  const userIds = await resolveRegisteredUserIds();
  if (userIds.length === 0) throw new Error('Нет зарегистрированных пользователей');
  return launchSequenceForUserIds(sequence, userIds, null);
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

export async function enableSequenceForPlanPurchase(sequenceId: number): Promise<void> {
  const sequence = await MailSequence.findByPk(sequenceId);
  if (!sequence) throw new Error('Цепочка не найдена');
  if (sequence.triggerType !== 'plan_purchase') {
    throw new Error('Включение доступно только для цепочек «Покупка тарифа»');
  }
  if (getSequenceTriggerPlanCodes(sequence).length === 0) {
    throw new Error('Укажите тариф для триггера');
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
    }
  }
  return enrolled;
}

/** Запись в цепочки с триггером «покупка тарифа». Безопасно вызывать повторно (findOrCreate). */
export async function enrollUserOnPlanPurchase(userId: number, planCodeLike: string): Promise<number> {
  const planCode = normalizePlanCode(planCodeLike);
  if (planCode === 'free') return 0;

  // Сначала исключения: остановить цепочки, где купленный тариф в исключениях
  await applyPlanPurchaseExclusions(userId, planCode);

  const sequences = await MailSequence.findAll({
    where: {
      isActive: true,
      triggerType: 'plan_purchase',
      launchedAt: { [Op.ne]: null },
    },
  });

  let enrolled = 0;
  for (const sequence of sequences) {
    const triggerPlans = getSequenceTriggerPlanCodes(sequence);
    if (!triggerPlans.includes(planCode)) continue;

    const result = await enrollUserInSequence(userId, sequence.id);
    if (result === 'enrolled') {
      enrolled++;
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
