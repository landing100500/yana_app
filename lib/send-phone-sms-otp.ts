import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { NextRequest } from 'next/server';
import User from '@/models/User';
import UserAnketa from '@/models/UserAnketa';
import PhoneOtp from '@/models/PhoneOtp';
import SmsSendLog from '@/models/SmsSendLog';
import { initDatabase } from '@/lib/initDb';
import { sendSmsRu } from '@/lib/sms-ru';
import { getClientIp } from '@/lib/client-ip';
import { getFreeAiRequestsForNewUsers } from '@/lib/free-ai-requests-settings';

const OTP_TTL_MS = 10 * 60 * 1000;
const SMS_COOLDOWN_MS = 60 * 1000;
const SMS_PER_HOUR = 5;

function random4Digits(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export type SendPhoneOtpResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Отправка SMS с кодом: регистрация или сброс (при requireExistingUser).
 */
export async function sendPhoneSmsOtp(
  request: NextRequest,
  normalizedPhone: string,
  options: { requireExistingUser: boolean }
): Promise<SendPhoneOtpResult> {
  await initDatabase();

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const sentLastHour = await SmsSendLog.count({
    where: {
      phone: normalizedPhone,
      createdAt: { [Op.gt]: hourAgo },
    },
  });
  if (sentLastHour >= SMS_PER_HOUR) {
    return { ok: false, status: 429, error: 'Слишком много запросов кода. Попробуйте позже.' };
  }

  const lastLog = await SmsSendLog.findOne({
    where: { phone: normalizedPhone },
    order: [['createdAt', 'DESC']],
  });
  if (lastLog && Date.now() - lastLog.createdAt.getTime() < SMS_COOLDOWN_MS) {
    return { ok: false, status: 429, error: 'Повторная отправка возможна через минуту.' };
  }

  let user = await User.findOne({ where: { phone: normalizedPhone } });

  if (options.requireExistingUser) {
    if (!user) {
      return { ok: false, status: 404, error: 'Пользователь с таким номером не найден' };
    }
  } else if (!user) {
    const freeAiRequestsLimit = await getFreeAiRequestsForNewUsers();
    user = await User.create({ phone: normalizedPhone, freeAiRequestsLimit });
    await UserAnketa.create({
      userId: user.id,
      gender: null,
      birthDate: null,
      birthCity: null,
      birthTime: null,
      name: null,
      motherJob: null,
      fatherJob: null,
      hasMoved: null,
      lifeDifficulties: null,
    });
  }

  const code = random4Digits();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await PhoneOtp.upsert({
    phone: normalizedPhone,
    codeHash,
    expiresAt,
    attempts: 0,
  });

  const clientIp = getClientIp(request);
  const msg = options.requireExistingUser
    ? `Код восстановления ЯСНА: ${code}`
    : `Код входа ЯСНА: ${code}`;

  const sendResult = await sendSmsRu({
    to: normalizedPhone,
    message: msg,
    clientIp,
  });

  if (!sendResult.ok) {
    await PhoneOtp.destroy({ where: { phone: normalizedPhone } });
    console.error('sms.ru:', sendResult.error);
    return {
      ok: false,
      status: 502,
      error: sendResult.error || 'Не удалось отправить SMS',
    };
  }

  await SmsSendLog.create({ phone: normalizedPhone });
  return { ok: true };
}
