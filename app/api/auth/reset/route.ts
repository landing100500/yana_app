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

    const user = await User.findOne({ where: { phone } });

    if (!user) {
      return NextResponse.json(
        { error: 'Пользователь с таким номером не найден' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Инструкции по восстановлению пароля отправлены',
    });
  } catch (error: any) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка при обработке запроса' },
      { status: 500 }
    );
  }
}

