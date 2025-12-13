import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import Session from '@/models/Session';
import { initDatabase } from '@/lib/initDb';

const JWT_SECRET = process.env.JWT_SECRET || 'yasna-secret-key-change-in-production';

export async function GET(request: NextRequest) {
  try {
    await initDatabase();

    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      console.log('No token found in cookies');
      return NextResponse.json(
        { authenticated: false, reason: 'no_token' },
        { status: 401 }
      );
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };

      const session = await Session.findOne({
        where: {
          token,
          userId: decoded.userId,
          expiresAt: {
            [Op.gt]: new Date(),
          },
        },
      });

      if (!session) {
        console.log('Session not found in database');
        return NextResponse.json(
          { authenticated: false, reason: 'no_session' },
          { status: 401 }
        );
      }

      return NextResponse.json({
        authenticated: true,
        userId: decoded.userId,
      });
    } catch (jwtError) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }
  } catch (error: any) {
    console.error('Auth check error:', error);
    return NextResponse.json(
      { authenticated: false },
      { status: 500 }
    );
  }
}

