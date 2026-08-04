import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import User from '@/models/User';
import UserAnketa from '@/models/UserAnketa';
import EmailOtp from '@/models/EmailOtp';
import EmailSendLog from '@/models/EmailSendLog';
import { initDatabase } from '@/lib/initDb';
import { isSmtpConfigured, sendSimpleEmail } from '@/lib/email-transport';
import { alertAdminAsync, alertSmtpMisconfigured } from '@/lib/admin-alerts';
import { getFreeAiRequestsForNewUsers } from '@/lib/free-ai-requests-settings';

const OTP_TTL_MS = 10 * 60 * 1000;
const EMAIL_COOLDOWN_MS = 60 * 1000;
const EMAIL_PER_HOUR = 5;

function random4Digits(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export type SendEmailOtpResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

async function sendOtpMail(email: string, code: string, subject: string): Promise<void> {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || '';
  await sendSimpleEmail({
    to: email,
    subject,
    text: [
      'Здравствуйте!',
      '',
      `Ваш код подтверждения YASNA: ${code}`,
      'Код действует 10 минут.',
      '',
      'Если вы не запрашивали код, просто проигнорируйте это письмо.',
      '',
      'С уважением,',
      'Команда YASNA',
    ].join('\n'),
    html: [
      '<p>Здравствуйте!</p>',
      `<p>Ваш код подтверждения <b>YASNA: ${code}</b></p>`,
      '<p>Код действует 10 минут.</p>',
      '<p>Если вы не запрашивали код, просто проигнорируйте это письмо.</p>',
      '<br />',
      '<p>С уважением,<br/>Команда YASNA</p>',
    ].join(''),
    headers: {
      'X-Auto-Response-Suppress': 'All',
      ...(from ? { 'List-Unsubscribe': `<mailto:${from}?subject=unsubscribe>` } : {}),
    },
  });
}

export async function sendEmailOtp(
  email: string,
  options: { requireExistingUser: boolean }
): Promise<SendEmailOtpResult> {
  await initDatabase();

  if (!isSmtpConfigured()) {
    alertSmtpMisconfigured('auth/email-otp');
    return { ok: false, status: 502, error: 'Почтовый сервис временно недоступен' };
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const sentLastHour = await EmailSendLog.count({
    where: {
      email,
      createdAt: { [Op.gt]: hourAgo },
    },
  });
  if (sentLastHour >= EMAIL_PER_HOUR) {
    return { ok: false, status: 429, error: 'Слишком много запросов кода. Попробуйте позже.' };
  }

  const lastLog = await EmailSendLog.findOne({
    where: { email },
    order: [['createdAt', 'DESC']],
  });
  if (lastLog && Date.now() - lastLog.createdAt.getTime() < EMAIL_COOLDOWN_MS) {
    return { ok: false, status: 429, error: 'Повторная отправка возможна через минуту.' };
  }

  let user = await User.findOne({ where: { email } });

  if (options.requireExistingUser) {
    if (!user) {
      return { ok: false, status: 404, error: 'Пользователь с таким email не найден' };
    }
  } else if (!user) {
    const freeAiRequestsLimit = await getFreeAiRequestsForNewUsers();
    user = await User.create({ email, freeAiRequestsLimit });
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

  await EmailOtp.upsert({
    email,
    codeHash,
    expiresAt,
    attempts: 0,
  });

  try {
    const subject = options.requireExistingUser ? 'Код восстановления ЯСНА' : 'Код входа ЯСНА';
    await sendOtpMail(email, code, subject);
    await EmailSendLog.create({ email });
    return { ok: true };
  } catch (error) {
    console.error('OTP SMTP error:', error);
    await EmailOtp.destroy({ where: { email } });
    alertAdminAsync({
      source: options.requireExistingUser ? 'auth/reset' : 'auth/signup',
      severity: 'high',
      title: options.requireExistingUser
        ? 'Восстановление: SMTP не отправил код'
        : 'Регистрация: SMTP не отправил код',
      detail: 'Пользователь не получит код — проверьте SMTP / лимиты Beget',
      meta: { email },
      error,
    });
    return { ok: false, status: 502, error: 'Не удалось отправить письмо с кодом' };
  }
}
