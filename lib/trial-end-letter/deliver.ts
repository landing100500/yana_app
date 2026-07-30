import User from '@/models/User';
import ChatTopic from '@/models/ChatTopic';
import Message from '@/models/Message';
import TrialEndLetterSend from '@/models/TrialEndLetterSend';
import { sendMarketingEmail } from '@/lib/email-transport';
import { userHasSucceededPayment } from '@/lib/plan-access';
import { getUserPlanSnapshot, FREE_AI_REQUESTS_LIMIT } from '@/lib/subscription';
import { composeTrialEndLetter } from './compose';
import { resolveTrialEndInputs } from './resolve';
import { getTrialEndLetterEnabled, getTrialEndTemplates } from './settings';
import { SIGN_NAMES_RU } from './types';

const FALLBACK_TOPIC_TITLE = 'Завершение пробного';

export type TrialEndDeliveryResult = {
  bodyText: string;
  alreadySent: boolean;
  chatSent: boolean;
  emailSent: boolean;
  sendId: number;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bodyToEmailHtml(bodyText: string): string {
  const withLinks = escapeHtml(bodyText).replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#6b5b95;">$1</a>'
  );
  return `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.55;color:#222;white-space:pre-wrap;">${withLinks}</div>`;
}

async function resolveTopicId(userId: number, preferredTopicId?: number | null): Promise<number> {
  if (preferredTopicId) {
    const preferred = await ChatTopic.findOne({ where: { id: preferredTopicId, userId } });
    if (preferred) return preferred.id;
  }

  const latest = await ChatTopic.findOne({
    where: { userId },
    order: [['updatedAt', 'DESC']],
  });
  if (latest) return latest.id;

  const created = await ChatTopic.create({
    userId,
    title: FALLBACK_TOPIC_TITLE,
  });
  return created.id;
}

/**
 * Одноразовая доставка письма «завершение пробного» в чат + на почту.
 * Идемпотентно по userId. Не трогает paid / не-free.
 */
export async function maybeDeliverTrialEndLetter(
  user: User,
  options?: { topicId?: number | null; forceIfBlocked?: boolean }
): Promise<TrialEndDeliveryResult | null> {
  const enabled = await getTrialEndLetterEnabled();
  if (!enabled) return null;

  const snapshot = getUserPlanSnapshot(user);
  if (snapshot.code !== 'free') return null;
  if (await userHasSucceededPayment(user.id)) return null;

  const used = Number((user as any).freeAiRequestsUsed) || 0;
  const atLimit = used >= FREE_AI_REQUESTS_LIMIT;
  if (!atLimit && !options?.forceIfBlocked) return null;

  const existing = await TrialEndLetterSend.findOne({ where: { userId: user.id } });
  if (existing) {
    return {
      bodyText: existing.bodyText,
      alreadySent: true,
      chatSent: existing.chatSent,
      emailSent: existing.emailSent,
      sendId: existing.id,
    };
  }

  const resolved = await resolveTrialEndInputs(user.id);
  if (!resolved) return null;

  const templates = await getTrialEndTemplates();
  const bodyText = composeTrialEndLetter({
    templates,
    lagneshaHouse: resolved.lagneshaHouse,
    lagnaSign: resolved.lagnaSign,
    gender: resolved.gender,
  });

  let chatSent = false;
  let topicId: number | null = null;
  try {
    topicId = await resolveTopicId(user.id, options?.topicId);
    await Message.create({
      topicId,
      role: 'assistant',
      content: bodyText,
    });
    chatSent = true;
  } catch (err) {
    console.error('[trial-end-letter] chat save failed', user.id, err);
  }

  let emailSent = false;
  let emailError: string | null = null;
  const email = (user.email || '').trim() || null;
  if (email) {
    try {
      await sendMarketingEmail({
        to: email,
        subject: 'Ясна — твой следующий шаг',
        html: bodyToEmailHtml(bodyText),
        text: bodyText,
      });
      emailSent = true;
    } catch (err: any) {
      emailError = err?.message || String(err);
      console.error('[trial-end-letter] email failed', user.id, emailError);
    }
  } else {
    emailError = 'no_email';
  }

  try {
    const row = await TrialEndLetterSend.create({
      userId: user.id,
      email,
      bodyText,
      lagnaSign: resolved.lagnaSign,
      lagneshaHouse: resolved.lagneshaHouse,
      lagneshaPlanet: resolved.lagneshaPlanet,
      gender: resolved.gender,
      chatSent,
      emailSent,
      emailError,
      topicId,
      sentAt: new Date(),
    });

    return {
      bodyText,
      alreadySent: false,
      chatSent,
      emailSent,
      sendId: row.id,
    };
  } catch (err: any) {
    // Гонка: другой запрос уже создал запись
    if (err?.name === 'SequelizeUniqueConstraintError') {
      const again = await TrialEndLetterSend.findOne({ where: { userId: user.id } });
      if (again) {
        return {
          bodyText: again.bodyText,
          alreadySent: true,
          chatSent: again.chatSent,
          emailSent: again.emailSent,
          sendId: again.id,
        };
      }
    }
    console.error('[trial-end-letter] persist failed', user.id, err);
    return chatSent || emailSent
      ? {
          bodyText,
          alreadySent: false,
          chatSent,
          emailSent,
          sendId: 0,
        }
      : null;
  }
}

export async function getTrialEndLetterBodyForUser(userId: number): Promise<string | null> {
  const row = await TrialEndLetterSend.findOne({ where: { userId } });
  return row?.bodyText || null;
}

export function formatTrialEndMeta(row: {
  lagnaSign: number;
  lagneshaHouse: number;
  lagneshaPlanet: string;
  gender: string;
}): string {
  const sign = SIGN_NAMES_RU[row.lagnaSign] || String(row.lagnaSign);
  const genderRu = row.gender === 'female' ? 'Ж' : 'М';
  return `${sign}, ${row.lagneshaPlanet} в ${row.lagneshaHouse} доме, ${genderRu}`;
}
