import PartnerReferral from '@/models/PartnerReferral';
import User from '@/models/User';
import { findPartnerByReferralCode, getOrCreatePartnerProfile } from './balance';

export const REFERRAL_COOKIE_NAME = 'yana_ref';
export const REFERRAL_COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60;

export const REFERRAL_PROMO_MONTHLY_PLANS = new Set(['optimalLight', 'optimal']);
export const REFERRAL_PROMO_DURATION_DAYS = 90;
export const REFERRAL_PROMO_PRICE_MULTIPLIER = 2;

/**
 * Привязывает нового пользователя к партнёру по коду из cookie.
 * Не перезаписывает существующую атрибуцию. Self-ref запрещён.
 */
export async function attachReferralOnRegistration(params: {
  userId: number;
  referralCode: string | null | undefined;
}): Promise<{ attached: boolean; partnerUserId?: number }> {
  const code = String(params.referralCode || '').trim();
  if (!code) return { attached: false };

  const existing = await PartnerReferral.findOne({
    where: { referredUserId: params.userId },
  });
  if (existing) {
    return { attached: false, partnerUserId: existing.partnerUserId };
  }

  const partnerProfile = await findPartnerByReferralCode(code);
  if (!partnerProfile) return { attached: false };
  if (partnerProfile.userId === params.userId) return { attached: false };

  const user = await User.findByPk(params.userId);
  if (!user) return { attached: false };

  const now = new Date();
  await PartnerReferral.create({
    partnerUserId: partnerProfile.userId,
    referredUserId: params.userId,
    registeredAt: now,
  });

  (user as any).referredByUserId = partnerProfile.userId;
  await user.save();

  return { attached: true, partnerUserId: partnerProfile.userId };
}

export async function isReferralUser(userId: number): Promise<boolean> {
  const row = await PartnerReferral.findOne({
    where: { referredUserId: userId },
    attributes: ['id'],
  });
  return Boolean(row);
}

export async function ensurePartnerAndGetCode(userId: number): Promise<string> {
  const profile = await getOrCreatePartnerProfile(userId);
  return profile.referralCode;
}
