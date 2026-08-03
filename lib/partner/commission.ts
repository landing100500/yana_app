import { Transaction } from 'sequelize';
import Payment from '@/models/Payment';
import PartnerReferral from '@/models/PartnerReferral';
import { applyBalanceChange, countPayingReferrals } from './balance';
import { formatMoney, getPartnerSettings, parseMoney, roundMoney } from './settings';

export function computeCommissionRate(params: {
  commissionPercent: number;
  volumeBonusPercent: number;
  volumeThreshold: number;
  payingReferralsCount: number;
}): number {
  const base = params.commissionPercent;
  if (params.payingReferralsCount > params.volumeThreshold) {
    return base + params.volumeBonusPercent;
  }
  return base;
}

/**
 * Начисляет комиссию партнёру после успешной оплаты реферала.
 * Идемпотентно по paymentId. Вызывать после коммита activatePlanForPayment
 * или внутри той же транзакции, если передана.
 */
export async function creditPartnerCommissionForPayment(
  payment: Payment,
  transaction?: Transaction
): Promise<{ credited: boolean; amountRub?: number; ratePercent?: number }> {
  if (payment.status !== 'succeeded') {
    return { credited: false };
  }

  const paymentAmount = parseMoney(payment.amountValue);
  if (paymentAmount <= 0) {
    return { credited: false };
  }

  const run = async (tx: Transaction) => {
    const referral = await PartnerReferral.findOne({
      where: { referredUserId: payment.userId },
      transaction: tx,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!referral) {
      return { credited: false as const };
    }

    const settings = await getPartnerSettings();
    const now = new Date();

    if (!referral.firstPaidAt) {
      referral.firstPaidAt = payment.paidAt ?? now;
      const expires = new Date(referral.firstPaidAt);
      expires.setMonth(expires.getMonth() + settings.referralMonths);
      referral.windowExpiresAt = expires;
      await referral.save({ transaction: tx });
    }

    if (referral.windowExpiresAt && now > new Date(referral.windowExpiresAt)) {
      return { credited: false as const };
    }

    const payingCount = await countPayingReferrals(referral.partnerUserId, tx);
    const ratePercent = computeCommissionRate({
      commissionPercent: settings.commissionPercent,
      volumeBonusPercent: settings.volumeBonusPercent,
      volumeThreshold: settings.volumeThreshold,
      payingReferralsCount: payingCount,
    });

    const amountRub = roundMoney((paymentAmount * ratePercent) / 100);
    if (amountRub <= 0) {
      return { credited: false as const };
    }

    await applyBalanceChange({
      partnerUserId: referral.partnerUserId,
      type: 'commission',
      amountRub,
      paymentId: payment.id,
      meta: {
        referredUserId: payment.userId,
        planCode: payment.planCode,
        paymentAmount: formatMoney(paymentAmount),
        ratePercent,
      },
      transaction: tx,
    });

    return { credited: true as const, amountRub, ratePercent };
  };

  if (transaction) {
    return run(transaction);
  }

  const sequelize = (await import('@/lib/db')).default;
  return sequelize.transaction(async (tx) => run(tx));
}
