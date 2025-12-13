import { NextRequest, NextResponse } from 'next/server';
import sequelize from '@/lib/db';
import User from '@/models/User';
import { initDatabase } from '@/lib/initDb';

export async function POST(request: NextRequest) {
  try {
    await initDatabase();

    const { phone } = await request.json();

    if (!phone) {
      return NextResponse.json(
        { error: 'Номер телефона обязателен' },
        { status: 400 }
      );
    }

    let user = await User.findOne({ where: { phone } });

    if (!user) {
      user = await User.create({ phone });
    }

    return NextResponse.json({
      success: true,
      message: 'Код отправлен (мнимая авторизация - любой номер работает)',
    });
  } catch (error: any) {
    console.error('Phone auth error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка при обработке запроса' },
      { status: 500 }
    );
  }
}

