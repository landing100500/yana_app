import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Op, Transaction } from 'sequelize';
import sequelize from '@/lib/db';
import { initDatabase } from '@/lib/initDb';
import {
  applyBalanceChange,
  generateReferralCode,
  getOrCreatePartnerProfile,
  getPartnerSettings,
  parseMoney,
  setPartnerSettings,
  countPayingReferrals,
} from '@/lib/partner';
import { buildPaginationMeta, parsePagination } from '@/lib/pagination';
import PartnerProfile from '@/models/PartnerProfile';
import PartnerReferral from '@/models/PartnerReferral';
import PartnerVerification from '@/models/PartnerVerification';
import PartnerWithdrawal from '@/models/PartnerWithdrawal';
import PartnerLedger from '@/models/PartnerLedger';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  return cookieStore.get('admin_auth')?.value === 'true';
}

function mapUser(user: any) {
  if (!user) return null;
  return {
    id: Number(user.id),
    name: user.name ?? null,
    email: user.email ?? null,
    phone: user.phone ?? null,
  };
}

async function loadUsersMap(userIds: number[]) {
  const ids = Array.from(new Set(userIds.filter((id) => Number.isFinite(id) && id > 0)));
  if (!ids.length) return new Map<number, any>();
  const users = await User.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'name', 'email', 'phone'],
    raw: true,
  });
  return new Map(users.map((u: any) => [Number(u.id), u]));
}

export async function GET(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const tab = searchParams.get('tab') || 'overview';
    const settings = await getPartnerSettings();
    const { page, limit, offset } = parsePagination(searchParams, 50);

    if (tab === 'counts') {
      const [pendingVerifications, pendingWithdrawals] = await Promise.all([
        PartnerVerification.count({ where: { status: 'pending' } }),
        PartnerWithdrawal.count({ where: { status: { [Op.in]: ['pending', 'approved'] } } }),
      ]);
      return NextResponse.json({ pendingVerifications, pendingWithdrawals });
    }

    if (tab === 'settings') {
      return NextResponse.json({ settings });
    }

    if (tab === 'ledger') {
      const userId = Number(searchParams.get('userId'));
      if (!Number.isFinite(userId) || userId <= 0) {
        return NextResponse.json({ error: 'userId обязателен' }, { status: 400 });
      }
      const total = await PartnerLedger.count({ where: { partnerUserId: userId } });
      const rows = await PartnerLedger.findAll({
        where: { partnerUserId: userId },
        order: [['id', 'DESC']],
        limit,
        offset,
      });
      return NextResponse.json({
        userId,
        rows: rows.map((row) => ({
          id: row.id,
          type: row.type,
          amountRub: parseMoney(row.amountRub),
          balanceAfter: parseMoney(row.balanceAfter),
          paymentId: row.paymentId,
          withdrawalId: row.withdrawalId,
          meta: row.meta
            ? (() => {
                try {
                  return JSON.parse(row.meta);
                } catch {
                  return null;
                }
              })()
            : null,
          createdAt: row.createdAt,
        })),
        ...buildPaginationMeta(total, page, limit),
      });
    }

    if (tab === 'partners') {
      const q = String(searchParams.get('q') || '').trim();
      let userIdsFilter: number[] | null = null;
      if (q) {
        const matchedUsers = await User.findAll({
          where: {
            [Op.or]: [
              { email: { [Op.like]: `%${q}%` } },
              { phone: { [Op.like]: `%${q}%` } },
              { name: { [Op.like]: `%${q}%` } },
              ...(Number.isFinite(Number(q)) ? [{ id: Number(q) }] : []),
            ],
          },
          attributes: ['id'],
          raw: true,
        });
        userIdsFilter = matchedUsers.map((u: any) => Number(u.id));
        const byCode = await PartnerProfile.findAll({
          where: { referralCode: { [Op.like]: `%${q.toUpperCase()}%` } },
          attributes: ['userId'],
          raw: true,
        });
        userIdsFilter = Array.from(
          new Set([...userIdsFilter, ...byCode.map((p: any) => Number(p.userId))])
        );
        if (!userIdsFilter.length) {
          return NextResponse.json({
            settings,
            partners: [],
            ...buildPaginationMeta(0, page, limit),
          });
        }
      }

      const where = userIdsFilter ? { userId: { [Op.in]: userIdsFilter } } : undefined;
      const total = await PartnerProfile.count({ where });
      const profiles = await PartnerProfile.findAll({
        where,
        order: [['id', 'DESC']],
        limit,
        offset,
      });
      const userById = await loadUsersMap(profiles.map((p) => p.userId));
      const partners = await Promise.all(
        profiles.map(async (p) => {
          const paying = await countPayingReferrals(p.userId);
          const totalRefs = await PartnerReferral.count({ where: { partnerUserId: p.userId } });
          return {
            id: p.id,
            userId: p.userId,
            referralCode: p.referralCode,
            balanceRub: parseMoney(p.balanceRub),
            verificationStatus: p.verificationStatus,
            payingReferrals: paying,
            referralsTotal: totalRefs,
            createdAt: p.createdAt,
            user: mapUser(userById.get(p.userId)),
          };
        })
      );
      return NextResponse.json({
        settings,
        partners,
        ...buildPaginationMeta(total, page, limit),
      });
    }

    if (tab === 'verifications') {
      const statusFilter = searchParams.get('status') || 'pending';
      const where =
        statusFilter === 'all' ? undefined : { status: statusFilter };
      const total = await PartnerVerification.count({ where });
      const verifications = await PartnerVerification.findAll({
        where,
        order: [['id', 'DESC']],
        limit,
        offset,
      });
      const userById = await loadUsersMap(verifications.map((v) => v.partnerUserId));
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
          user: mapUser(userById.get(v.partnerUserId)),
        })),
        ...buildPaginationMeta(total, page, limit),
      });
    }

    if (tab === 'withdrawals') {
      const statusFilter = searchParams.get('status') || 'open';
      const where =
        statusFilter === 'all'
          ? undefined
          : statusFilter === 'open'
            ? { status: { [Op.in]: ['pending', 'approved'] } }
            : { status: statusFilter };
      const total = await PartnerWithdrawal.count({ where });
      const withdrawals = await PartnerWithdrawal.findAll({
        where,
        order: [['id', 'DESC']],
        limit,
        offset,
      });
      const userById = await loadUsersMap(withdrawals.map((w) => w.partnerUserId));
      return NextResponse.json({
        settings,
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
          user: mapUser(userById.get(w.partnerUserId)),
        })),
        ...buildPaginationMeta(total, page, limit),
      });
    }

    // overview / badges defaults
    const [pendingVerifications, pendingWithdrawals, partnersTotal] = await Promise.all([
      PartnerVerification.count({ where: { status: 'pending' } }),
      PartnerWithdrawal.count({ where: { status: { [Op.in]: ['pending', 'approved'] } } }),
      PartnerProfile.count(),
    ]);

    return NextResponse.json({
      settings,
      pendingVerifications,
      pendingWithdrawals,
      partnersTotal,
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

    if (action === 'create_partner') {
      const userId = Number(body.userId);
      if (!Number.isFinite(userId) || userId <= 0) {
        return NextResponse.json({ error: 'userId обязателен' }, { status: 400 });
      }
      const user = await User.findByPk(userId);
      if (!user) {
        return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
      }
      const existing = await PartnerProfile.findOne({ where: { userId } });
      if (existing) {
        return NextResponse.json({ error: 'Партнёр уже существует', partner: existing }, { status: 409 });
      }
      let referralCode = String(body.referralCode || '')
        .trim()
        .toUpperCase();
      if (referralCode) {
        if (referralCode.length < 4 || referralCode.length > 32) {
          return NextResponse.json({ error: 'Код 4–32 символа' }, { status: 400 });
        }
        const taken = await PartnerProfile.findOne({ where: { referralCode } });
        if (taken) {
          return NextResponse.json({ error: 'Код уже занят' }, { status: 409 });
        }
        const profile = await PartnerProfile.create({
          userId,
          referralCode,
          balanceRub: '0.00',
          verificationStatus: 'none',
        });
        return NextResponse.json({ success: true, partner: profile });
      }
      const profile = await getOrCreatePartnerProfile(userId);
      return NextResponse.json({ success: true, partner: profile });
    }

    if (action === 'update_partner') {
      const userId = Number(body.userId);
      if (!Number.isFinite(userId) || userId <= 0) {
        return NextResponse.json({ error: 'userId обязателен' }, { status: 400 });
      }
      const profile = await PartnerProfile.findOne({ where: { userId } });
      if (!profile) {
        return NextResponse.json({ error: 'Партнёр не найден' }, { status: 404 });
      }

      if (body.referralCode != null) {
        const code = String(body.referralCode).trim().toUpperCase();
        if (code.length < 4 || code.length > 32) {
          return NextResponse.json({ error: 'Код 4–32 символа' }, { status: 400 });
        }
        const taken = await PartnerProfile.findOne({
          where: { referralCode: code, userId: { [Op.ne]: userId } },
        });
        if (taken) {
          return NextResponse.json({ error: 'Код уже занят' }, { status: 409 });
        }
        profile.referralCode = code;
      }

      if (body.regenerateCode === true) {
        for (let i = 0; i < 8; i++) {
          const code = generateReferralCode();
          const taken = await PartnerProfile.findOne({ where: { referralCode: code } });
          if (!taken) {
            profile.referralCode = code;
            break;
          }
        }
      }

      if (
        body.verificationStatus === 'none' ||
        body.verificationStatus === 'pending' ||
        body.verificationStatus === 'approved' ||
        body.verificationStatus === 'rejected'
      ) {
        profile.verificationStatus = body.verificationStatus;
      }

      await profile.save();
      return NextResponse.json({
        success: true,
        partner: {
          userId: profile.userId,
          referralCode: profile.referralCode,
          balanceRub: parseMoney(profile.balanceRub),
          verificationStatus: profile.verificationStatus,
        },
      });
    }

    if (action === 'delete_partner') {
      const userId = Number(body.userId);
      if (!Number.isFinite(userId) || userId <= 0) {
        return NextResponse.json({ error: 'userId обязателен' }, { status: 400 });
      }
      const profile = await PartnerProfile.findOne({ where: { userId } });
      if (!profile) {
        return NextResponse.json({ error: 'Партнёр не найден' }, { status: 404 });
      }

      // Профиль и привязки рефералов снимаем; ledger / withdrawals / verifications НЕ удаляем
      await sequelize.transaction(async (transaction) => {
        await PartnerReferral.destroy({ where: { partnerUserId: userId }, transaction });
        await User.update(
          { referredByUserId: null },
          { where: { referredByUserId: userId }, transaction }
        );
        await profile.destroy({ transaction });
      });

      return NextResponse.json({
        success: true,
        message: 'Партнёр удалён. История движений баланса сохранена.',
      });
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
