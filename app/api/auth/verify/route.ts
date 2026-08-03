import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import User from '@/models/User';
import Session from '@/models/Session';
import UserAnketa from '@/models/UserAnketa';
import EmailOtp from '@/models/EmailOtp';
import { initDatabase } from '@/lib/initDb';
import { isValidEmail, normalizeEmail } from '@/lib/email';
import { attachReferralOnRegistration, REFERRAL_COOKIE_NAME } from '@/lib/partner';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'yasna-secret-key-change-in-production';

const MAX_OTP_ATTEMPTS = 5;

function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });
}

async function tryAttachReferral(request: NextRequest, userId: number) {
  const refCode = request.cookies.get(REFERRAL_COOKIE_NAME)?.value;
  if (!refCode) return;
  try {
    await attachReferralOnRegistration({ userId, referralCode: refCode });
  } catch (error) {
    console.warn('Referral attach failed:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const { code, email: rawEmail, phone: rawPhone, resetPin } = await request.json();

    if (!code || String(code).length !== 4) {
      return NextResponse.json({ error: 'Введите 4-значный код из письма' }, { status: 400 });
    }

    const email = normalizeEmail(String(rawEmail || ''));
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Email не найден' }, { status: 400 });
    }
    const phone = String(rawPhone || '').trim() || null;

    const otp = await EmailOtp.findOne({ where: { email } });

    if (!otp || otp.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'Код устарел или не запрашивался. Запросите новый.' },
        { status: 400 }
      );
    }

    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      await EmailOtp.destroy({ where: { email } });
      return NextResponse.json(
        { error: 'Слишком много неверных попыток. Запросите новый код.' },
        { status: 400 }
      );
    }

    const ok = await bcrypt.compare(String(code), otp.codeHash);
    if (!ok) {
      await otp.update({ attempts: otp.attempts + 1 });
      return NextResponse.json({ error: 'Неверный код' }, { status: 400 });
    }

    await EmailOtp.destroy({ where: { email } });

    let user = await User.findOne({ where: { email } });
    let wasJustCreated = false;

    if (resetPin) {
      if (!user) {
        return NextResponse.json({ error: 'Пользователь с таким email не найден' }, { status: 404 });
      }
      user.set('password', null);
      await user.save();
      const pinSetupToken = jwt.sign(
        { userId: user.id, email: user.email, purpose: 'pin_setup' },
        JWT_SECRET,
        { expiresIn: '15m' }
      );
      return NextResponse.json({
        success: true,
        needsPinSetup: true,
        pinSetupToken,
      });
    }

    if (!user) {
      user = await User.create({ email, phone });
      wasJustCreated = true;
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
    } else if (!resetPin && !user.phone && phone) {
      const phoneOwner = await User.findOne({ where: { phone, id: { [Op.ne]: user.id } } });
      if (phoneOwner) {
        return NextResponse.json(
          { error: 'Этот номер телефона уже используется в другом аккаунте' },
          { status: 409 }
        );
      }
      user.set('phone', phone);
      await user.save();
    }

    // Атрибуция только для новых или только что созданных при OTP (ещё без PIN)
    const createdRecently =
      user.createdAt && Date.now() - new Date(user.createdAt).getTime() < 48 * 60 * 60 * 1000;
    const noPinYet = !user.password;
    if (wasJustCreated || (createdRecently && noPinYet && !(user as any).referredByUserId)) {
      await tryAttachReferral(request, user.id);
    }

    const hasPin = Boolean(user.password && user.password.length > 0);

    if (!hasPin) {
      const pinSetupToken = jwt.sign(
        { userId: user.id, email: user.email, purpose: 'pin_setup' },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      return NextResponse.json({
        success: true,
        needsPinSetup: true,
        pinSetupToken,
      });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await Session.create({
      userId: user.id,
      token,
      expiresAt,
    });

    const response = NextResponse.json({
      success: true,
      needsPinSetup: false,
      token,
    });

    setAuthCookie(response, token);

    return response;
  } catch (error: unknown) {
    console.error('Verify error:', error);
    return NextResponse.json({ error: 'Произошла ошибка при проверке кода' }, { status: 500 });
  }
}
