import { Op } from 'sequelize';
import Payment from '@/models/Payment';
import User from '@/models/User';

export const PAID_PLAN_CODES = ['hours24', 'optimalLight', 'optimal', 'professional'] as const;

/** Оплата в ±48 ч от planAssignedAt считается выдачей тарифа через ЮKassa. */
export const PLAN_PAYMENT_MATCH_WINDOW_MS = 48 * 60 * 60 * 1000;

export function hasMatchingSucceededPayment(
  user: { id: number; planCode: string; planAssignedAt: Date | string | null },
  payments: Array<{ userId: number; planCode: string; paidAt: Date | string | null }>
): boolean {
  const assignedAt = user.planAssignedAt ? new Date(user.planAssignedAt).getTime() : NaN;
  if (!Number.isFinite(assignedAt)) return false;

  return payments.some((payment) => {
    if (Number(payment.userId) !== Number(user.id)) return false;
    if (payment.planCode !== user.planCode) return false;
    if (!payment.paidAt) return false;
    const paidAt = new Date(payment.paidAt).getTime();
    if (!Number.isFinite(paidAt)) return false;
    return Math.abs(paidAt - assignedAt) <= PLAN_PAYMENT_MATCH_WINDOW_MS;
  });
}

export async function findManualAssignmentUsersInPeriod(from: Date, to: Date) {
  const candidates = await User.findAll({
    where: {
      planCode: { [Op.in]: [...PAID_PLAN_CODES] },
      [Op.or]: [
        { planManuallyAssignedAt: { [Op.between]: [from, to] } },
        {
          planManuallyAssignedAt: null,
          planAssignedAt: { [Op.between]: [from, to] },
        },
      ],
    },
    order: [
      ['planManuallyAssignedAt', 'DESC'],
      ['planAssignedAt', 'DESC'],
    ],
    attributes: ['id', 'name', 'email', 'phone', 'planCode', 'planAssignedAt', 'planManuallyAssignedAt'],
    raw: true,
  });

  if (!candidates.length) return [];

  const candidateIds = candidates.map((u: any) => Number(u.id)).filter((id) => id > 0);
  const relatedPayments = await Payment.findAll({
    where: {
      userId: { [Op.in]: candidateIds },
      status: 'succeeded',
      planCode: { [Op.in]: [...PAID_PLAN_CODES] },
    },
    attributes: ['userId', 'planCode', 'paidAt'],
    raw: true,
  });

  const seen = new Set<number>();
  const manualUsers: any[] = [];

  for (const user of candidates as any[]) {
    const userId = Number(user.id);
    if (!userId || seen.has(userId)) continue;

    const manualAt = user.planManuallyAssignedAt
      ? new Date(user.planManuallyAssignedAt)
      : user.planAssignedAt
        ? new Date(user.planAssignedAt)
        : null;

    if (!manualAt || manualAt.getTime() < from.getTime() || manualAt.getTime() > to.getTime()) {
      continue;
    }

    if (hasMatchingSucceededPayment(user, relatedPayments as any[])) {
      continue;
    }

    seen.add(userId);
    manualUsers.push({
      ...user,
      manualEventAt: user.planManuallyAssignedAt ?? user.planAssignedAt,
    });
  }

  return manualUsers;
}
