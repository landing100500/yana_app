import { Op } from 'sequelize';
import Session from '@/models/Session';

const SESSION_DAYS = 30;

export async function ensureSessionForToken(userId: number, token: string): Promise<void> {
  const existing = await Session.findOne({
    where: { token, userId },
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  if (existing) {
    if (existing.expiresAt.getTime() <= Date.now()) {
      await existing.update({ expiresAt });
    }
    return;
  }

  await Session.create({
    userId,
    token,
    expiresAt,
  });
}

export async function hasValidSession(userId: number, token: string): Promise<boolean> {
  const session = await Session.findOne({
    where: {
      token,
      userId,
      expiresAt: { [Op.gt]: new Date() },
    },
  });
  return !!session;
}
