import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Transaction } from 'sequelize';
import sequelize from '@/lib/db';
import { initDatabase } from '@/lib/initDb';
import User from '@/models/User';
import Session from '@/models/Session';
import UserAnketa from '@/models/UserAnketa';
import NatalChart from '@/models/NatalChart';
import UserMemory from '@/models/UserMemory';
import ChatTopic from '@/models/ChatTopic';
import Message from '@/models/Message';
import ChatTopicSummary from '@/models/ChatTopicSummary';
import ChatRequestLog from '@/models/ChatRequestLog';
import Payment from '@/models/Payment';
import PhoneOtp from '@/models/PhoneOtp';
import SmsSendLog from '@/models/SmsSendLog';
import EmailOtp from '@/models/EmailOtp';
import EmailSendLog from '@/models/EmailSendLog';
import TrialEndLetterSend from '@/models/TrialEndLetterSend';

export const dynamic = 'force-dynamic';

const ADMIN_PASSWORD = '19791979';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  let transaction: Transaction | null = null;
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const userId = Number(params.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Неверный ID пользователя' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const adminPassword = String(body?.adminPassword || '');
    if (adminPassword !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Неверный пароль админки' }, { status: 403 });
    }

    const user = await User.findByPk(userId, { attributes: ['id', 'email', 'phone'] });
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    const userEmail = (user as any).email || null;
    const userPhone = (user as any).phone || null;

    transaction = await sequelize.transaction();

    const topicIds = (await ChatTopic.findAll({
      where: { userId },
      attributes: ['id'],
      transaction,
    })).map((topic: any) => topic.id);

    await ChatRequestLog.destroy({ where: { userId }, transaction });

    if (topicIds.length > 0) {
      await ChatTopicSummary.destroy({ where: { topicId: topicIds }, transaction });
      await Message.destroy({ where: { topicId: topicIds }, transaction });
      await ChatTopic.destroy({ where: { id: topicIds }, transaction });
    }

    await Payment.destroy({ where: { userId }, transaction });
    await UserMemory.destroy({ where: { userId }, transaction });
    await UserAnketa.destroy({ where: { userId }, transaction });
    await NatalChart.destroy({ where: { userId }, transaction });
    await TrialEndLetterSend.destroy({ where: { userId }, transaction });
    await Session.destroy({ where: { userId }, transaction });

    if (userPhone) {
      await PhoneOtp.destroy({ where: { phone: userPhone }, transaction });
      await SmsSendLog.destroy({ where: { phone: userPhone }, transaction });
    }
    if (userEmail) {
      await EmailOtp.destroy({ where: { email: userEmail }, transaction });
      await EmailSendLog.destroy({ where: { email: userEmail }, transaction });
    }

    await User.destroy({ where: { id: userId }, transaction });
    await transaction.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (transaction) {
      await transaction.rollback().catch(() => null);
    }
    console.error('Admin delete user error:', error);
    return NextResponse.json({ error: 'Ошибка при удалении пользователя' }, { status: 500 });
  }
}
