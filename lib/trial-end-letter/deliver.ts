import User from '@/models/User';
import ChatTopic from '@/models/ChatTopic';
import Message from '@/models/Message';
import Payment from '@/models/Payment';
import TrialEndLetterSend from '@/models/TrialEndLetterSend';
import { sendMarketingEmail } from '@/lib/email-transport';
import { buildSessionEndedUpsellMessage, buildSessionEndedUpsellEmailMessage } from '@/lib/plan-messages';
import { getUserPlanSnapshot, FREE_AI_REQUESTS_LIMIT } from '@/lib/subscription';
import { composeTrialEndLetter } from './compose';
import { isTrialEndResolveResult, resolveTrialEndInputs } from './resolve';
import { getTrialEndLetterEnabled, getTrialEndTemplates } from './settings';
import { SIGN_NAMES_RU } from './types';

async function userHasSucceededPayment(userId: number): Promise<boolean> {
  const count = await Payment.count({
    where: { userId, status: 'succeeded' },
  });
  return count > 0;
}

const FALLBACK_TOPIC_TITLE = 'Завершение пробного';

export type TrialEndDeliveryResult = {
  /** Только персоналка (для почты и истории). */
  bodyText: string;
  /** То же, что bodyText — персоналка. */
  personalizedText: string;
  /** Отдельное сообщение про тарифы (только чат). */
  upsellText: string;
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
  const paragraphs = bodyText
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const withBreaks = escapeHtml(p).replace(/\n/g, '<br/>');
      const withLinks = withBreaks.replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" style="color:#6b5b95;">$1</a>'
      );
      return `<p style="margin:0 0 1.1em;font-family:Georgia,serif;font-size:16px;line-height:1.55;color:#222;">${withLinks}</p>`;
    })
    .join('');
  return `<div>${paragraphs}</div>`;
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
  options?: { topicId?: number | null; forceIfBlocked?: boolean; skipChat?: boolean }
): Promise<TrialEndDeliveryResult | null> {
  const enabled = await getTrialEndLetterEnabled();
  if (!enabled) {
    console.warn('[trial-end-letter] skip: disabled', user.id);
    return null;
  }

  const snapshot = getUserPlanSnapshot(user);
  if (snapshot.code !== 'free') {
    console.warn('[trial-end-letter] skip: not free', user.id, snapshot.code);
    return null;
  }
  if (await userHasSucceededPayment(user.id)) {
    console.warn('[trial-end-letter] skip: has payment', user.id);
    return null;
  }

  const used = Number((user as any).freeAiRequestsUsed) || 0;
  const atLimit = used >= FREE_AI_REQUESTS_LIMIT;
  if (!atLimit && !options?.forceIfBlocked) {
    console.warn('[trial-end-letter] skip: not at limit', user.id, used);
    return null;
  }

  const existing = await TrialEndLetterSend.findOne({ where: { userId: user.id } });
  if (existing) {
    return {
      bodyText: existing.bodyText,
      personalizedText: existing.bodyText,
      upsellText: buildSessionEndedUpsellMessage(),
      alreadySent: true,
      chatSent: existing.chatSent,
      emailSent: existing.emailSent,
      sendId: existing.id,
    };
  }

  const resolved = await resolveTrialEndInputs(user.id);
  if (!isTrialEndResolveResult(resolved)) {
    console.warn('[trial-end-letter] skip: resolve failed', user.id, resolved.reason);
    return null;
  }

  const templates = await getTrialEndTemplates();
  const personalizedText = composeTrialEndLetter({
    templates,
    lagneshaHouse: resolved.lagneshaHouse,
    lagnaSign: resolved.lagnaSign,
    gender: resolved.gender,
  });
  const upsellText = buildSessionEndedUpsellMessage();
  // В истории/почте — только персоналка с абзацами
  const bodyText = personalizedText;

  let chatSent = false;
  let topicId: number | null = null;
  if (!options?.skipChat) {
    try {
      topicId = await resolveTopicId(user.id, options?.topicId);
      await Message.create({
        topicId,
        role: 'assistant',
        content: personalizedText,
      });
      await Message.create({
        topicId,
        role: 'assistant',
        content: upsellText,
      });
      chatSent = true;
    } catch (err) {
      console.error('[trial-end-letter] chat save failed', user.id, err);
    }
  } else {
    chatSent = true; // текст уйдёт в том же ответе стрима/клиента
  }

  let emailSent = false;
  let emailError: string | null = null;
  const email = (user.email || '').trim() || null;
  if (email) {
    const upsellEmailText = buildSessionEndedUpsellEmailMessage();
    const errors: string[] = [];
    try {
      await sendMarketingEmail({
        to: email,
        subject: 'Ясна — твой следующий шаг',
        html: bodyToEmailHtml(personalizedText),
        text: personalizedText,
      });
      emailSent = true;
    } catch (err: any) {
      errors.push(`personal: ${err?.message || String(err)}`);
      console.error('[trial-end-letter] email #1 failed', user.id, err);
    }
    try {
      await sendMarketingEmail({
        to: email,
        subject: 'Ясна — продолжим',
        html: bodyToEmailHtml(upsellEmailText),
        text: upsellEmailText,
      });
      emailSent = true;
    } catch (err: any) {
      errors.push(`upsell: ${err?.message || String(err)}`);
      console.error('[trial-end-letter] email #2 failed', user.id, err);
    }
    if (errors.length) emailError = errors.join('; ');
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
      personalizedText,
      upsellText,
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
          personalizedText: again.bodyText,
          upsellText,
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
          personalizedText,
          upsellText,
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
