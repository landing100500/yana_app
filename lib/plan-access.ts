import Payment from '@/models/Payment';
import User from '@/models/User';
import {
  FREE_PROMO_MONTHS,
  getUserPlanSnapshot,
  UserPlanSnapshot,
} from '@/lib/subscription';
import {
  buildFreePromoEndedMessage,
  buildSessionEndedUpsellMessage,
} from '@/lib/plan-messages';
import { maybeDeliverTrialEndLetter } from '@/lib/trial-end-letter';

export function isChatTimeBlocked(snapshot: UserPlanSnapshot): boolean {
  if (snapshot.hasUnlimitedTime) return false;
  if (snapshot.code === 'free') {
    return (snapshot.remainingAiRequests ?? 0) <= 0;
  }
  return (snapshot.remainingSeconds ?? 0) <= 0;
}

export async function userHasSucceededPayment(userId: number): Promise<boolean> {
  const count = await Payment.count({
    where: { userId, status: 'succeeded' },
  });
  return count > 0;
}

export function isFreePromoPeriodEnded(user: User): boolean {
  const createdAt = user.createdAt ? new Date(user.createdAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
  const promoEnd = new Date(createdAt);
  promoEnd.setMonth(promoEnd.getMonth() + FREE_PROMO_MONTHS);
  return Date.now() >= promoEnd.getTime();
}

export async function buildChatBlockMessage(user: User, snapshot: UserPlanSnapshot): Promise<string> {
  const hasPaid = await userHasSucceededPayment(user.id);

  if (hasPaid && snapshot.code !== 'free') {
    return buildSessionEndedUpsellMessage();
  }

  if (snapshot.code === 'free' && !hasPaid) {
    // Письмо должно уйти сразу после N-го бесплатного запроса; здесь — страховка.
    // При доставке в чат уже пишутся 2 сообщения; в 403 показываем тарифы.
    const delivered = await maybeDeliverTrialEndLetter(user, { forceIfBlocked: true });
    if (delivered && !delivered.alreadySent) {
      return delivered.upsellText;
    }
  }

  if (snapshot.code === 'free' && isFreePromoPeriodEnded(user) && !hasPaid) {
    return buildFreePromoEndedMessage(user.name);
  }

  return buildSessionEndedUpsellMessage();
}

export async function getChatBlockState(user: User) {
  const snapshot = getUserPlanSnapshot(user);
  if (!isChatTimeBlocked(snapshot)) {
    return { blocked: false as const, snapshot };
  }
  const message = await buildChatBlockMessage(user, snapshot);
  return { blocked: true as const, snapshot, message };
}
