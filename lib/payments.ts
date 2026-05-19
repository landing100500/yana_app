import Payment from '@/models/Payment';
import User from '@/models/User';
import { assignPlanDates, getUserPlanSnapshot, PlanCode } from '@/lib/subscription';
import { getYookassaPayment } from '@/lib/yookassa';

export async function activatePlanForPayment(payment: Payment): Promise<Payment> {
  if (payment.status === 'succeeded') return payment;

  const user = await User.findByPk(payment.userId);
  if (!user) {
    throw new Error('User not found for payment');
  }

  const planCode = payment.planCode as PlanCode;
  const { assignedAt, expiresAt } = assignPlanDates(planCode);
  (user as any).planCode = planCode;
  (user as any).planAssignedAt = assignedAt;
  (user as any).planExpiresAt = expiresAt;
  await user.save();

  payment.status = 'succeeded';
  payment.paidAt = new Date();
  await payment.save();

  return payment;
}

export async function syncPaymentWithYookassa(payment: Payment): Promise<Payment> {
  if (payment.status === 'succeeded' || payment.status === 'canceled') {
    return payment;
  }

  if (!payment.yookassaPaymentId) {
    return payment;
  }

  const remote = await getYookassaPayment(payment.yookassaPaymentId);

  const metadataUserId = remote.metadata?.user_id;
  const metadataPlanCode = remote.metadata?.plan_code;
  if (metadataUserId && Number(metadataUserId) !== payment.userId) {
    throw new Error('Payment metadata user mismatch');
  }
  if (metadataPlanCode && metadataPlanCode !== payment.planCode) {
    throw new Error('Payment metadata plan mismatch');
  }
  if (remote.amount.value !== payment.amountValue || remote.amount.currency !== payment.currency) {
    throw new Error('Payment amount mismatch');
  }

  if (remote.status === 'succeeded') {
    return activatePlanForPayment(payment);
  }

  if (remote.status === 'canceled') {
    payment.status = 'canceled';
    await payment.save();
  }

  return payment;
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
