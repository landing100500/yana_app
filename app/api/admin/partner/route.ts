import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Op } from 'sequelize';
import { initDatabase } from '@/lib/initDb';
import {
  getPartnerSettings,
  parseMoney,
  setPartnerSettings,
  countPayingReferrals,
} from '@/lib/partner';
import PartnerProfile from '@/models/PartnerProfile';
import PartnerReferral from '@/models/PartnerReferral';
import PartnerVerification from '@/models/PartnerVerification';
import PartnerWithdrawal from '@/models/PartnerWithdrawal';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  return cookieStore.get('admin_auth')?.value === 'true';
}

export async function GET(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const tab = request.nextUrl.searchParams.get('tab') || 'overview';
    const settings = await getPartnerSettings();

    if (tab === 'settings') {
      return NextResponse.json({ settings });
    }

    const [verifications, withdrawals, profiles] = await Promise.all([
      PartnerVerification.findAll({
        where: tab === 'verifications' ? { status: 'pending' } : undefined,
        order: [['id', 'DESC']],
        limit: tab === 'verifications' ? 100 : 30,
      }),
      PartnerWithdrawal.findAll({
        where: tab === 'withdrawals' ? { status: { [Op.in]: ['pending', 'approved'] } } : undefined,
        order: [['id', 'DESC']],
        limit: tab === 'withdrawals' ? 100 : 30,
      }),
      PartnerProfile.findAll({
        order: [['id', 'DESC']],
        limit: 100,
      }),
    ]);

    const userIds = Array.from(
      new Set([
        ...verifications.map((v) => v.partnerUserId),
        ...withdrawals.map((w) => w.partnerUserId),
        ...profiles.map((p) => p.userId),
      ])
    );

    const users = userIds.length
      ? await User.findAll({
          where: { id: { [Op.in]: userIds } },
          attributes: ['id', 'name', 'email', 'phone'],
          raw: true,
        })
      : [];
    const userById = new Map(users.map((u: any) => [Number(u.id), u]));

    const partners = await Promise.all(
      profiles.map(async (p) => {
        const paying = await countPayingReferrals(p.userId);
        const total = await PartnerReferral.count({ where: { partnerUserId: p.userId } });
        const user = userById.get(p.userId);
        return {
          userId: p.userId,
          referralCode: p.referralCode,
          balanceRub: parseMoney(p.balanceRub),
          verificationStatus: p.verificationStatus,
          payingReferrals: paying,
          referralsTotal: total,
          user: user
            ? { id: user.id, name: user.name, email: user.email, phone: user.phone }
            : null,
        };
      })
    );

    return NextResponse.json({
      settings,
      verifications: verifications.map((v) => ({
        id: v.id,
        partnerUserId: v.partnerUserId,
        passportScanPath: v.passportScanPath,
        innScanPath: v.innScanPath,
        innNumber: v.innNumber,
        status: v.status,
        adminNote: v.adminNote,
        createdAt: v.createdAt,
        user: userById.get(v.partnerUserId) || null,
      })),
      withdrawals: withdrawals.map((w) => ({
        id: w.id,
        partnerUserId: w.partnerUserId,
        amountRub: parseMoney(w.amountRub),
        ndflPercent: parseMoney(w.ndflPercent),
        ndflAmount: parseMoney(w.ndflAmount),
        payoutAmount: parseMoney(w.payoutAmount),
        method: w.method,
        requisites: w.requisites,
        status: w.status,
        adminNote: w.adminNote,
        createdAt: w.createdAt,
        processedAt: w.processedAt,
        user: userById.get(w.partnerUserId) || null,
      })),
      partners,
    });
  } catch (error) {
    console.error('admin partner GET:', error);
    return NextResponse.json({ error: 'Ошибка загрузки партнерки' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '');

    if (action === 'settings') {
      const settings = await setPartnerSettings({
        commissionPercent: body.commissionPercent,
        volumeBonusPercent: body.volumeBonusPercent,
        volumeThreshold: body.volumeThreshold,
        minWithdrawalRub: body.minWithdrawalRub,
        ndflPercent: body.ndflPercent,
        referralMonths: body.referralMonths,
      });
      return NextResponse.json({ success: true, settings });
    }

    if (action === 'verification') {
      const id = Number(body.id);
      const status = body.status === 'approved' || body.status === 'rejected' ? body.status : null;
      if (!id || !status) {
        return NextResponse.json({ error: 'Нужны id и status' }, { status: 400 });
      }
      const row = await PartnerVerification.findByPk(id);
      if (!row) return NextResponse.json({ error: 'Не найдено' }, { status: 404 });
      row.status = status;
      row.adminNote = body.adminNote != null ? String(body.adminNote) : row.adminNote;
      row.reviewedAt = new Date();
      await row.save();
      await PartnerProfile.update(
        { verificationStatus: status },
        { where: { userId: row.partnerUserId } }
      );
      return NextResponse.json({ success: true });
    }

    if (action === 'withdrawal') {
      const id = Number(body.id);
      const status =
        body.status === 'approved' || body.status === 'paid' || body.status === 'rejected'
          ? body.status
          : null;
      if (!id || !status) {
        return NextResponse.json({ error: 'Нужны id и status' }, { status: 400 });
      }

      const sequelize = (await import('@/lib/db')).default;
      const { Transaction } = await import('sequelize');
      const { applyBalanceChange } = await import('@/lib/partner');

      await sequelize.transaction(async (transaction) => {
        const row = await PartnerWithdrawal.findByPk(id, {
          transaction,
          lock: Transaction.LOCK.UPDATE,
        });
        if (!row) throw Object.assign(new Error('not found'), { status: 404 });

        const prev = row.status;
        if (prev === 'paid') {
          throw Object.assign(new Error('Уже выплачено'), { status: 400 });
        }

        if (status === 'rejected' && (prev === 'pending' || prev === 'approved')) {
          await applyBalanceChange({
            partnerUserId: row.partnerUserId,
            type: 'adjustment',
            amountRub: parseMoney(row.amountRub),
            withdrawalId: row.id,
            meta: { reason: 'withdrawal_rejected_refund' },
            transaction,
          });
        }

        row.status = status;
        row.adminNote = body.adminNote != null ? String(body.adminNote) : row.adminNote;
        row.processedAt = new Date();
        await row.save({ transaction });
      });

      return NextResponse.json({ success: true });
    }

    if (action === 'adjustment') {
      const userId = Number(body.userId);
      const amountRub = Number(body.amountRub);
      if (!userId || !Number.isFinite(amountRub) || amountRub === 0) {
        return NextResponse.json({ error: 'userId и ненулевая amountRub обязательны' }, { status: 400 });
      }
      const sequelize = (await import('@/lib/db')).default;
      const { applyBalanceChange, getOrCreatePartnerProfile } = await import('@/lib/partner');
      await getOrCreatePartnerProfile(userId);
      await sequelize.transaction(async (transaction) => {
        await applyBalanceChange({
          partnerUserId: userId,
          type: 'adjustment',
          amountRub,
          meta: { note: body.note || null, admin: true },
          transaction,
        });
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  } catch (error: any) {
    console.error('admin partner PATCH:', error);
    return NextResponse.json(
      { error: error?.message || 'Ошибка обновления' },
      { status: error?.status || 500 }
    );
  }
}
