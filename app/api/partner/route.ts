import { NextResponse } from 'next/server';
import { initDatabase } from '@/lib/initDb';
import { getAuthenticatedUserId } from '@/lib/auth-user';
import {
  computeCommissionRate,
  countPayingReferrals,
  getOrCreatePartnerProfile,
  getPartnerSettings,
  parseMoney,
} from '@/lib/partner';
import PartnerLedger from '@/models/PartnerLedger';
import PartnerReferral from '@/models/PartnerReferral';
import PartnerWithdrawal from '@/models/PartnerWithdrawal';
import { getAppBaseUrl } from '@/lib/app-url';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await initDatabase();
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const profile = await getOrCreatePartnerProfile(userId);
    const settings = await getPartnerSettings();
    const payingCount = await countPayingReferrals(userId);
    const ratePercent = computeCommissionRate({
      commissionPercent: settings.commissionPercent,
      volumeBonusPercent: settings.volumeBonusPercent,
      volumeThreshold: settings.volumeThreshold,
      payingReferralsCount: payingCount,
    });

    const [referralsTotal, ledger, withdrawals] = await Promise.all([
      PartnerReferral.count({ where: { partnerUserId: userId } }),
      PartnerLedger.findAll({
        where: { partnerUserId: userId },
        order: [['id', 'DESC']],
        limit: 50,
      }),
      PartnerWithdrawal.findAll({
        where: { partnerUserId: userId },
        order: [['id', 'DESC']],
        limit: 20,
      }),
    ]);

    const balance = parseMoney(profile.balanceRub);
    const needMore = Math.max(0, settings.minWithdrawalRub - balance);

    return NextResponse.json({
      referralCode: profile.referralCode,
      referralUrl: `${getAppBaseUrl()}/?ref=${profile.referralCode}`,
      balanceRub: balance,
      verificationStatus: profile.verificationStatus,
      ratePercent,
      baseRatePercent: settings.commissionPercent,
      volumeBonusPercent: settings.volumeBonusPercent,
      volumeThreshold: settings.volumeThreshold,
      payingReferralsCount: payingCount,
      referralsTotal,
      minWithdrawalRub: settings.minWithdrawalRub,
      ndflPercent: settings.ndflPercent,
      needMoreForWithdrawal: needMore,
      canWithdraw: balance >= settings.minWithdrawalRub && profile.verificationStatus === 'approved',
      ledger: ledger.map((row) => ({
        id: row.id,
        type: row.type,
        amountRub: parseMoney(row.amountRub),
        balanceAfter: parseMoney(row.balanceAfter),
        createdAt: row.createdAt,
        meta: row.meta ? safeJson(row.meta) : null,
      })),
      withdrawals: withdrawals.map((row) => ({
        id: row.id,
        amountRub: parseMoney(row.amountRub),
        ndflAmount: parseMoney(row.ndflAmount),
        payoutAmount: parseMoney(row.payoutAmount),
        method: row.method,
        status: row.status,
        createdAt: row.createdAt,
        processedAt: row.processedAt,
        adminNote: row.adminNote,
      })),
    });
  } catch (error) {
    console.error('partner GET error:', error);
    return NextResponse.json({ error: 'Ошибка загрузки партнерки' }, { status: 500 });
  }
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
