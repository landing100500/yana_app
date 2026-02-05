import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

export async function GET() {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('ai_sections')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ sections: data || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Ошибка при получении разделов' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, description } = await request.json();

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Название раздела обязательно' },
        { status: 400 }
      );
    }

    // Создаем раздел
    const { data: section, error: sectionError } = await supabase
      .from('ai_sections')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sectionError) throw sectionError;

    // Создаем таблицу для векторных данных этого раздела
    // В Supabase используем pgvector через расширение
    // Таблица будет создана автоматически при первой вставке данных
    // Но нам нужно убедиться, что расширение pgvector установлено

    return NextResponse.json({ section });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Ошибка при создании раздела' },
      { status: 500 }
    );
  }
}
