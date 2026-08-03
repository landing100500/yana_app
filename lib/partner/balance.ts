import { randomBytes } from 'crypto';
import { Op, Transaction } from 'sequelize';
import PartnerProfile from '@/models/PartnerProfile';
import PartnerReferral from '@/models/PartnerReferral';
import PartnerLedger, { PartnerLedgerType } from '@/models/PartnerLedger';
import { formatMoney, parseMoney } from './settings';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateReferralCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

export async function getOrCreatePartnerProfile(
  userId: number,
  transaction?: Transaction
): Promise<PartnerProfile> {
  const existing = await PartnerProfile.findOne({ where: { userId }, transaction });
  if (existing) return existing;

  for (let attempt = 0; attempt < 8; attempt++) {
    const referralCode = generateReferralCode();
    try {
      return await PartnerProfile.create(
        {
          userId,
          referralCode,
          balanceRub: '0.00',
          verificationStatus: 'none',
        },
        { transaction }
      );
    } catch (error: unknown) {
      const message = String((error as Error)?.message || '').toLowerCase();
      if (message.includes('duplicate') || message.includes('unique')) {
        const again = await PartnerProfile.findOne({ where: { userId }, transaction });
        if (again) return again;
        continue;
      }
      throw error;
    }
  }

  throw new Error('Failed to create partner profile');
}

export async function findPartnerByReferralCode(code: string): Promise<PartnerProfile | null> {
  const normalized = String(code || '')
    .trim()
    .toUpperCase();
  if (!normalized || normalized.length < 4) return null;
  return PartnerProfile.findOne({ where: { referralCode: normalized } });
}

export async function countPayingReferrals(
  partnerUserId: number,
  transaction?: Transaction
): Promise<number> {
  return PartnerReferral.count({
    where: {
      partnerUserId,
      firstPaidAt: { [Op.ne]: null },
    },
    transaction,
  });
}

export async function applyBalanceChange(params: {
  partnerUserId: number;
  type: PartnerLedgerType;
  amountRub: number;
  paymentId?: number | null;
  withdrawalId?: number | null;
  meta?: Record<string, unknown> | null;
  transaction: Transaction;
}): Promise<{ profile: PartnerProfile; ledger: PartnerLedger; balanceAfter: number }> {
  const profile = await PartnerProfile.findOne({
    where: { userId: params.partnerUserId },
    transaction: params.transaction,
    lock: Transaction.LOCK.UPDATE,
  });
  if (!profile) {
    throw new Error('Partner profile not found');
  }

  if (params.type === 'commission' && params.paymentId) {
    const existing = await PartnerLedger.findOne({
      where: { paymentId: params.paymentId, type: 'commission' },
      transaction: params.transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (existing) {
      return {
        profile,
        ledger: existing,
        balanceAfter: parseMoney(existing.balanceAfter),
      };
    }
  }

  const current = parseMoney(profile.balanceRub);
  const next = Math.round((current + params.amountRub + Number.EPSILON) * 100) / 100;
  if (next < -0.001) {
    throw new Error('Insufficient partner balance');
  }

  const balanceAfterStr = formatMoney(Math.max(0, next));
  profile.balanceRub = balanceAfterStr;
  await profile.save({ transaction: params.transaction });

  const ledger = await PartnerLedger.create(
    {
      partnerUserId: params.partnerUserId,
      type: params.type,
      amountRub: formatMoney(params.amountRub),
      balanceAfter: balanceAfterStr,
      paymentId: params.paymentId ?? null,
      withdrawalId: params.withdrawalId ?? null,
      meta: params.meta ? JSON.stringify(params.meta) : null,
    },
    { transaction: params.transaction }
  );

  return { profile, ledger, balanceAfter: parseMoney(balanceAfterStr) };
}
