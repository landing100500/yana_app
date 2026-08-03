import { Op, Transaction } from 'sequelize';
import sequelize from '@/lib/db';
import Payment from '@/models/Payment';
import User from '@/models/User';
import { assignPlanDates, getUserPlanSnapshot, normalizePlanCode, PlanCode, resetPlanDailyUsage } from '@/lib/subscription';
import { getYookassaPayment } from '@/lib/yookassa';

const PENDING_RECONCILE_DAYS = 14;

function paymentAmountsMatch(local: string, remote: string): boolean {
  const a = Number.parseFloat(String(local).replace(',', '.'));
  const b = Number.parseFloat(String(remote).replace(',', '.'));
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return String(local).trim() === String(remote).trim();
  }
  return Math.abs(a - b) < 0.01;
}

function isPlanActiveForUser(user: User, planCode: PlanCode): boolean {
  return getUserPlanSnapshot(user).code === planCode;
}

function isRemotePaymentSuccessful(remote: Awaited<ReturnType<typeof getYookassaPayment>>): boolean {
  if (remote.status === 'canceled') return false;
  return remote.status === 'succeeded' || remote.paid === true;
}

async function applyPlanToUser(
  user: User,
  planCode: PlanCode,
  options?: { durationDaysOverride?: number | null; transaction?: Transaction }
): Promise<void> {
  const assignedAt = new Date();
  let expiresAt: Date | null;

  const override = options?.durationDaysOverride;
  if (override != null && Number.isFinite(override) && override > 0) {
    expiresAt = new Date(assignedAt);
    expiresAt.setDate(expiresAt.getDate() + Math.floor(override));
  } else {
    const dates = assignPlanDates(planCode);
    expiresAt = dates.expiresAt;
  }

  (user as any).planCode = planCode;
  (user as any).planAssignedAt = assignedAt;
  (user as any).planExpiresAt = expiresAt;
  (user as any).planManuallyAssignedAt = null;
  if (planCode === 'free') {
    (user as any).freeAiRequestsUsed = 0;
  }
  resetPlanDailyUsage(user);
  await user.save({ transaction: options?.transaction });
}

export async function activatePlanForPayment(payment: Payment): Promise<Payment> {
  const wasAlreadySucceeded = payment.status === 'succeeded';

  const result = await sequelize.transaction(async (transaction) => {
    const lockedPayment = await Payment.findByPk(payment.id, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!lockedPayment) {
      throw new Error('Payment not found');
    }

    const user = await User.findByPk(lockedPayment.userId, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!user) {
      throw new Error('User not found for payment');
    }

    const planCode = normalizePlanCode(lockedPayment.planCode);
    const paymentAlreadySettled = lockedPayment.status === 'succeeded';
    const durationOverride = (lockedPayment as any).durationDaysOverride as number | null | undefined;

    if (paymentAlreadySettled) {
      if (!isPlanActiveForUser(user, planCode)) {
        await applyPlanToUser(user, planCode, {
          durationDaysOverride: durationOverride,
          transaction,
        });
      }
      if (!lockedPayment.paidAt) {
        lockedPayment.paidAt = new Date();
        await lockedPayment.save({ transaction });
      }
      return lockedPayment;
    }

    await applyPlanToUser(user, planCode, {
      durationDaysOverride: durationOverride,
      transaction,
    });
    lockedPayment.status = 'succeeded';
    lockedPayment.paidAt = lockedPayment.paidAt ?? new Date();
    await lockedPayment.save({ transaction });
    return lockedPayment;
  });

  // После коммита оплаты: партнёрская комиссия (идемпотентно по paymentId)
  if (!wasAlreadySucceeded && result.status === 'succeeded') {
    try {
      const { creditPartnerCommissionForPayment } = await import('@/lib/partner');
      await creditPartnerCommissionForPayment(result);
    } catch (commissionError) {
      console.error('Partner commission credit failed', {
        paymentId: result.id,
        userId: result.userId,
        commissionError,
      });
    }
  }

  // После коммита: запись в цепочки «покупка тарифа» (только при первой успешной оплате)
  if (!wasAlreadySucceeded && result.status === 'succeeded') {
    try {
      const { enrollUserOnPlanPurchase } = await import('@/lib/mail-marketing');
      await enrollUserOnPlanPurchase(result.userId, result.planCode);
    } catch (error) {
      console.error('Plan purchase sequence enroll failed', {
        userId: result.userId,
        planCode: result.planCode,
        error,
      });
    }
  }

  return result;
}

function validateRemotePayment(payment: Payment, remote: Awaited<ReturnType<typeof getYookassaPayment>>) {
  const metadataUserId = remote.metadata?.user_id;
  const metadataPlanCode = remote.metadata?.plan_code;
  if (metadataUserId && Number(metadataUserId) !== payment.userId) {
    throw new Error('Payment metadata user mismatch');
  }
  if (metadataPlanCode && normalizePlanCode(metadataPlanCode) !== normalizePlanCode(payment.planCode)) {
    throw new Error('Payment metadata plan mismatch');
  }
  if (!paymentAmountsMatch(payment.amountValue, remote.amount.value)) {
    console.warn('YooKassa amount mismatch', {
      paymentId: payment.id,
      local: payment.amountValue,
      remote: remote.amount.value,
    });
  }
  if (remote.amount.currency !== payment.currency) {
    throw new Error('Payment currency mismatch');
  }
}

export async function syncPaymentWithYookassa(payment: Payment): Promise<Payment> {
  await payment.reload();

  if (payment.status === 'canceled') {
    return payment;
  }

  if (!payment.yookassaPaymentId) {
    if (payment.status === 'succeeded') {
      return activatePlanForPayment(payment);
    }
    return payment;
  }

  const remote = await getYookassaPayment(payment.yookassaPaymentId);
  validateRemotePayment(payment, remote);

  if (isRemotePaymentSuccessful(remote)) {
    return activatePlanForPayment(payment);
  }

  if (remote.status === 'canceled') {
    payment.status = 'canceled';
    await payment.save();
    return payment;
  }

  if (payment.status === 'succeeded') {
    return activatePlanForPayment(payment);
  }

  return payment;
}

export async function findPaymentByYookassaId(yookassaPaymentId: string): Promise<Payment | null> {
  let payment = await Payment.findOne({ where: { yookassaPaymentId } });
  if (payment) return payment;

  try {
    const remote = await getYookassaPayment(yookassaPaymentId);
    const localPaymentId = Number(remote.metadata?.payment_id);
    if (!Number.isFinite(localPaymentId) || localPaymentId <= 0) {
      return null;
    }

    payment = await Payment.findByPk(localPaymentId);
    if (!payment) return null;

    if (!payment.yookassaPaymentId) {
      payment.yookassaPaymentId = yookassaPaymentId;
      await payment.save();
    }

    return payment;
  } catch (error) {
    console.warn('YooKassa payment lookup failed', yookassaPaymentId, error);
    return null;
  }
}

/** Синхронизирует незавершённые платежи пользователя с ЮKassa (после оплаты без return_url / webhook). */
export async function reconcileUserPendingPayments(userId: number): Promise<void> {
  const since = new Date(Date.now() - PENDING_RECONCILE_DAYS * 24 * 60 * 60 * 1000);
  const pendingPayments = await Payment.findAll({
    where: {
      userId,
      status: 'pending',
      yookassaPaymentId: { [Op.ne]: null },
      createdAt: { [Op.gt]: since },
    },
    order: [['id', 'DESC']],
    limit: 10,
  });

  for (const payment of pendingPayments) {
    try {
      await syncPaymentWithYookassa(payment);
    } catch (error) {
      console.error('Payment reconcile failed', {
        paymentId: payment.id,
        userId,
        error,
      });
    }
  }
}

export async function getPaymentStatusPayload(payment: Payment, user: User) {
  await reconcileUserPendingPayments(user.id);
  const synced = await syncPaymentWithYookassa(payment);
  await user.reload();
  return {
    id: synced.id,
    status: synced.status,
    planCode: synced.planCode,
    paidAt: synced.paidAt ? synced.paidAt.toISOString() : null,
    plan: getUserPlanSnapshot(user),
  };
}
