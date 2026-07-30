import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Op } from 'sequelize';
import { initDatabase } from '@/lib/initDb';
import TrialEndLetterSend from '@/models/TrialEndLetterSend';
import User from '@/models/User';
import { SIGN_NAMES_RU } from '@/lib/trial-end-letter';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

export async function GET(request: NextRequest) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await initDatabase();

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id') || 0);
    if (id > 0) {
      const row = await TrialEndLetterSend.findByPk(id);
      if (!row) return NextResponse.json({ error: 'Не найдено' }, { status: 404 });
      const user = await User.findByPk(row.userId, {
        attributes: ['id', 'name', 'email', 'phone'],
      });
      return NextResponse.json({
        item: {
          id: row.id,
          userId: row.userId,
          userName: user?.name || null,
          userEmail: row.email || user?.email || null,
          userPhone: user?.phone || null,
          bodyText: row.bodyText,
          lagnaSign: row.lagnaSign,
          lagnaSignName: SIGN_NAMES_RU[row.lagnaSign] || String(row.lagnaSign),
          lagneshaHouse: row.lagneshaHouse,
          lagneshaPlanet: row.lagneshaPlanet,
          gender: row.gender,
          chatSent: row.chatSent,
          emailSent: row.emailSent,
          emailError: row.emailError,
          topicId: row.topicId,
          sentAt: row.sentAt,
        },
      });
    }

    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize') || 20)));
    const q = String(searchParams.get('q') || '').trim();

    const where: any = {};
    if (q) {
      const users = await User.findAll({
        where: {
          [Op.or]: [
            { email: { [Op.like]: `%${q}%` } },
            { phone: { [Op.like]: `%${q}%` } },
            { name: { [Op.like]: `%${q}%` } },
          ],
        },
        attributes: ['id'],
        limit: 200,
      });
      const ids = users.map((u) => u.id);
      where[Op.or] = [
        { userId: { [Op.in]: ids.length ? ids : [-1] } },
        { email: { [Op.like]: `%${q}%` } },
      ];
    }

    const total = await TrialEndLetterSend.count({ where });
    const rows = await TrialEndLetterSend.findAll({
      where,
      order: [['sentAt', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    const userIds = Array.from(new Set(rows.map((r) => r.userId)));
    const users = userIds.length
      ? await User.findAll({
          where: { id: { [Op.in]: userIds } },
          attributes: ['id', 'name', 'email', 'phone'],
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return NextResponse.json({
      total,
      page,
      pageSize,
      items: rows.map((row) => {
        const user = userMap.get(row.userId);
        return {
          id: row.id,
          userId: row.userId,
          userName: user?.name || null,
          userEmail: row.email || user?.email || null,
          userPhone: user?.phone || null,
          lagnaSignName: SIGN_NAMES_RU[row.lagnaSign] || String(row.lagnaSign),
          lagneshaHouse: row.lagneshaHouse,
          lagneshaPlanet: row.lagneshaPlanet,
          gender: row.gender,
          chatSent: row.chatSent,
          emailSent: row.emailSent,
          sentAt: row.sentAt,
        };
      }),
    });
  } catch (e) {
    console.error('admin trial-end history GET:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
