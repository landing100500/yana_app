import { Op } from 'sequelize';
import MailSequence from '@/models/MailSequence';
import MailListMember from '@/models/MailListMember';
import MailSequenceEnrollment from '@/models/MailSequenceEnrollment';
import MailSend from '@/models/MailSend';
import User from '@/models/User';
import { getUserPlanSnapshot, normalizePlanCode, parsePlanCode, type PlanCode } from '@/lib/subscription';

export const PAID_PLAN_CODES: PlanCode[] = ['hours24', 'optimalLight', 'optimal', 'professional'];

export function parsePlanCodesJson(raw: string | null | undefined): PlanCode[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const codes: PlanCode[] = [];
    for (const item of parsed) {
      const code = parsePlanCode(item);
      if (code && code !== 'free' && !codes.includes(code)) {
        codes.push(code);
      }
    }
    return codes;
  } catch {
    return [];
  }
}

export function serializePlanCodes(codes: unknown): string | null {
  if (!Array.isArray(codes) || codes.length === 0) return null;
  const normalized: PlanCode[] = [];
  for (const item of codes) {
    const code = parsePlanCode(item);
    if (code && code !== 'free' && !normalized.includes(code)) {
      normalized.push(code);
    }
  }
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

/** Тарифы-триггеры с учётом legacy-поля triggerPlanCode */
export function getSequenceTriggerPlanCodes(sequence: MailSequence): PlanCode[] {
  const fromJson = parsePlanCodesJson(sequence.triggerPlanCodes);
  if (fromJson.length > 0) return fromJson;
  const legacy = parsePlanCode(sequence.triggerPlanCode);
  return legacy && legacy !== 'free' ? [legacy] : [];
}

export function getSequenceExcludePlanCodes(sequence: MailSequence): PlanCode[] {
  return parsePlanCodesJson(sequence.excludePlanCodes);
}

export async function isUserExcludedFromSequence(
  userId: number,
  sequence: MailSequence
): Promise<boolean> {
  if (sequence.excludeListId) {
    const inList = await MailListMember.findOne({
      where: { listId: sequence.excludeListId, userId },
      attributes: ['id'],
    });
    if (inList) return true;
  }

  const user = await User.findByPk(userId);
  if (!user) return true;

  const snapshot = getUserPlanSnapshot(user);
  const userPlan = snapshot.code;

  if (sequence.excludeAllPaidPlans && userPlan !== 'free' && snapshot.isActive) {
    return true;
  }

  const excludePlans = getSequenceExcludePlanCodes(sequence);
  if (excludePlans.length > 0 && excludePlans.includes(userPlan) && snapshot.isActive) {
    return true;
  }

  return false;
}

export async function cancelEnrollmentForExclusion(enrollmentId: number): Promise<void> {
  await MailSequenceEnrollment.update(
    {
      status: 'cancelled',
      nextSendAt: null,
      completedAt: new Date(),
    },
    { where: { id: enrollmentId, status: 'active' } }
  );
  await MailSend.update(
    { status: 'failed', errorMessage: 'Исключён из цепочки' },
    { where: { enrollmentId, status: 'pending' } }
  );
}

/** После покупки тарифа — остановить цепочки, где этот тариф в исключениях */
export async function applyPlanPurchaseExclusions(userId: number, planCodeLike: string): Promise<number> {
  const purchasedPlan = normalizePlanCode(planCodeLike);
  if (purchasedPlan === 'free') return 0;

  const sequences = await MailSequence.findAll({
    where: { launchedAt: { [Op.ne]: null } },
  });

  let cancelled = 0;
  for (const sequence of sequences) {
    let shouldCancel = false;

    if (sequence.excludeAllPaidPlans) {
      shouldCancel = true;
    } else {
      const excludePlans = getSequenceExcludePlanCodes(sequence);
      if (excludePlans.includes(purchasedPlan)) {
        shouldCancel = true;
      }
    }

    if (!shouldCancel) continue;

    const enrollments = await MailSequenceEnrollment.findAll({
      where: { sequenceId: sequence.id, userId, status: 'active' },
    });
    for (const enrollment of enrollments) {
      await cancelEnrollmentForExclusion(enrollment.id);
      cancelled++;
    }
  }

  return cancelled;
}

export function normalizeSequenceRulesInput(body: {
  triggerType?: string;
  triggerPlanCode?: string | null;
  triggerPlanCodes?: unknown;
  excludePlanCodes?: unknown;
  excludeAllPaidPlans?: boolean;
  excludeListId?: number | string | null;
}): {
  triggerType: string;
  triggerPlanCode: string | null;
  triggerPlanCodes: string | null;
  excludePlanCodes: string | null;
  excludeAllPaidPlans: boolean;
  excludeListId: number | null;
} {
  const triggerType = body.triggerType || 'none';
  const allowed = new Set(['none', 'manual', 'all_users', 'new_user', 'plan_purchase']);
  if (!allowed.has(triggerType)) {
    throw new Error('Неизвестный тип триггера');
  }

  let triggerPlanCodes: string | null = null;
  let triggerPlanCode: string | null = null;

  if (triggerType === 'plan_purchase') {
    const codes =
      Array.isArray(body.triggerPlanCodes) && body.triggerPlanCodes.length > 0
        ? body.triggerPlanCodes
        : body.triggerPlanCode
          ? [body.triggerPlanCode]
          : [];
    triggerPlanCodes = serializePlanCodes(codes);
    const parsed = parsePlanCodesJson(triggerPlanCodes);
    if (parsed.length === 0) {
      throw new Error('Для триггера «Покупка тарифа» выберите хотя бы один тариф');
    }
    triggerPlanCode = parsed[0];
  }

  const excludePlanCodes = serializePlanCodes(body.excludePlanCodes);
  const excludeAllPaidPlans = !!body.excludeAllPaidPlans;
  const excludeListId =
    body.excludeListId !== undefined && body.excludeListId !== null && body.excludeListId !== ''
      ? Number(body.excludeListId)
      : null;

  if (excludeListId !== null && (!Number.isFinite(excludeListId) || excludeListId <= 0)) {
    throw new Error('Некорректный список исключений');
  }

  return {
    triggerType,
    triggerPlanCode,
    triggerPlanCodes,
    excludePlanCodes,
    excludeAllPaidPlans,
    excludeListId,
  };
}
