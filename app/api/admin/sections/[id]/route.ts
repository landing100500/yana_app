import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sectionId = params.id;

    if (!sectionId) {
      return NextResponse.json(
        { error: 'ID раздела не указан' },
        { status: 400 }
      );
    }

    // Проверяем наличие service_role ключа
    const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!hasServiceRoleKey) {
      console.warn('SUPABASE_SERVICE_ROLE_KEY not set - deletion may fail due to RLS policies');
    }

    // Используем admin клиент для удаления (обходит RLS если используется service_role)
    const adminSupabase = getSupabaseAdmin();
    console.log(`Using admin client for deletion (service_role: ${hasServiceRoleKey})`);

    // Проверяем, что раздел существует
    const { data: section, error: sectionError } = await adminSupabase
      .from('ai_sections')
      .select('*')
      .eq('id', sectionId)
      .single();

    if (sectionError || !section) {
      console.error('Section not found:', sectionError);
      return NextResponse.json(
        { error: 'Раздел не найден', details: sectionError?.message },
        { status: 404 }
      );
    }

    console.log(`Starting deletion of section ${sectionId}...`);

    // Сначала проверяем, сколько векторов нужно удалить
    const { count: vectorsCount, error: countError } = await adminSupabase
      .from('ai_vectors')
      .select('*', { count: 'exact', head: true })
      .eq('section_id', sectionId);

    if (countError) {
      console.error('Error counting vectors:', countError);
    } else {
      console.log(`Found ${vectorsCount || 0} vectors to delete for section ${sectionId}`);
    }

    // Пробуем использовать SQL функцию для удаления (обходит RLS через SECURITY DEFINER)
    try {
      const { data: functionResult, error: functionError } = await adminSupabase
        .rpc('delete_section_with_vectors', { section_uuid: sectionId });

      if (!functionError && functionResult && functionResult.success) {
        console.log('Deletion via SQL function successful:', functionResult);
        return NextResponse.json({
          success: true,
          message: `Раздел и все связанные данные успешно удалены. Удалено ${functionResult.deleted_vectors || 0} чанков.`,
          deletedVectors: functionResult.deleted_vectors || 0,
        });
      } else if (functionError) {
        console.warn('SQL function deletion failed, trying direct deletion:', functionError);
        // Продолжаем с прямым удалением
      }
    } catch (functionErr: any) {
      console.warn('SQL function not available or failed, trying direct deletion:', functionErr.message);
      // Продолжаем с прямым удалением
    }

    // Fallback: прямое удаление через admin клиент
    console.log('Using direct deletion method...');

    // Удаляем все векторные данные раздела
    // Не используем .select() при удалении, так как это может не работать с RLS
    const { error: vectorsDeleteError, count: deletedVectorsCount } = await adminSupabase
      .from('ai_vectors')
      .delete({ count: 'exact' })
      .eq('section_id', sectionId);

    if (vectorsDeleteError) {
      console.error('Error deleting vectors:', vectorsDeleteError);
      console.error('Error details:', JSON.stringify(vectorsDeleteError, null, 2));
      
      // Если ошибка связана с RLS, даем понятное сообщение
      if (vectorsDeleteError.code === '42501' || vectorsDeleteError.message?.includes('policy')) {
        return NextResponse.json(
          { 
            error: 'Ошибка доступа: RLS политики блокируют удаление',
            details: vectorsDeleteError.message,
            suggestion: 'ВАЖНО: Выполните SQL функцию delete_section_with_vectors в Supabase SQL Editor (см. DELETE_FIX.md или supabase-setup.sql, строки 110-144). Или добавьте SUPABASE_SERVICE_ROLE_KEY в .env.local'
          },
          { status: 403 }
        );
      }
      
      return NextResponse.json(
        { 
          error: 'Ошибка при удалении векторных данных',
          details: vectorsDeleteError.message,
          code: vectorsDeleteError.code,
          hint: vectorsDeleteError.hint,
          suggestion: 'Убедитесь, что SUPABASE_SERVICE_ROLE_KEY установлен в .env.local и что SQL функция delete_section_with_vectors создана в Supabase'
        },
        { status: 500 }
      );
    }

    const deletedCount = deletedVectorsCount || 0;
    console.log(`Successfully deleted ${deletedCount} vectors for section ${sectionId}`);

    // Удаляем раздел
    const { error: deleteError, count: deletedSectionCount } = await adminSupabase
      .from('ai_sections')
      .delete({ count: 'exact' })
      .eq('id', sectionId);

    if (deleteError) {
      console.error('Error deleting section:', deleteError);
      console.error('Error details:', JSON.stringify(deleteError, null, 2));
      
      // Если ошибка связана с RLS, даем понятное сообщение
      if (deleteError.code === '42501' || deleteError.message?.includes('policy')) {
        return NextResponse.json(
          { 
            error: 'Ошибка доступа: RLS политики блокируют удаление раздела',
            details: deleteError.message,
            suggestion: 'ВАЖНО: Выполните SQL функцию delete_section_with_vectors в Supabase SQL Editor (см. DELETE_FIX.md или supabase-setup.sql, строки 110-144). Или добавьте SUPABASE_SERVICE_ROLE_KEY в .env.local'
          },
          { status: 403 }
        );
      }
      
      return NextResponse.json(
        { 
          error: deleteError.message || 'Ошибка при удалении раздела',
          details: deleteError.message,
          code: deleteError.code,
          hint: deleteError.hint,
          suggestion: 'Убедитесь, что SUPABASE_SERVICE_ROLE_KEY установлен в .env.local'
        },
        { status: 500 }
      );
    }

    if (deletedSectionCount === 0) {
      console.warn(`Section ${sectionId} was not deleted (blocked by RLS or already deleted)`);
      return NextResponse.json(
        { 
          error: 'Раздел не был удален. RLS политики блокируют удаление.',
          suggestion: 'ВАЖНО: Выполните SQL функцию delete_section_with_vectors в Supabase SQL Editor (см. DELETE_FIX.md или supabase-setup.sql, строки 110-144). Эта функция обходит RLS политики.'
        },
        { status: 403 }
      );
    } else {
      console.log(`Successfully deleted section ${sectionId}`);
    }

    return NextResponse.json({
      success: true,
      message: `Раздел и все связанные данные успешно удалены. Удалено ${deletedCount} чанков.`,
      deletedVectors: deletedCount,
    });
  } catch (error: any) {
    console.error('Delete section error:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { 
        error: error.message || 'Ошибка при удалении раздела',
        details: error.stack
      },
      { status: 500 }
    );
  }
}
