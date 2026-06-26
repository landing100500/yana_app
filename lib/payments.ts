import Payment from '@/models/Payment';
import User from '@/models/User';
import { assignPlanDates, getUserPlanSnapshot, normalizePlanCode, PlanCode, resetPlanDailyUsage } from '@/lib/subscription';
import { getYookassaPayment } from '@/lib/yookassa';

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

async function applyPlanToUser(user: User, planCode: PlanCode): Promise<void> {
  const { assignedAt, expiresAt } = assignPlanDates(planCode);
  (user as any).planCode = planCode;
  (user as any).planAssignedAt = assignedAt;
  (user as any).planExpiresAt = expiresAt;
  (user as any).planManuallyAssignedAt = null;
  if (planCode === 'free') {
    (user as any).freeAiRequestsUsed = 0;
  }
  resetPlanDailyUsage(user);
  await user.save();
}

export async function activatePlanForPayment(payment: Payment): Promise<Payment> {
  const user = await User.findByPk(payment.userId);
  if (!user) {
    throw new Error('User not found for payment');
  }

  const planCode = normalizePlanCode(payment.planCode);
  const paymentAlreadySettled = payment.status === 'succeeded';
  const planAlreadyActive = isPlanActiveForUser(user, planCode);

  if (paymentAlreadySettled && planAlreadyActive) {
    if (!payment.paidAt) {
      payment.paidAt = new Date();
      await payment.save();
    }
    return payment;
  }

  await applyPlanToUser(user, planCode);

  if (!paymentAlreadySettled) {
    payment.status = 'succeeded';
    payment.paidAt = payment.paidAt ?? new Date();
    await payment.save();
  } else if (!payment.paidAt) {
    payment.paidAt = new Date();
    await payment.save();
  }

  return payment;
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

export async function getPaymentStatusPayload(payment: Payment, user: User) {
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
