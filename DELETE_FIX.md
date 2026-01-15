# Исправление проблемы с удалением разделов

## Проблема
RLS (Row Level Security) политики блокируют удаление разделов и чанков через обычный Supabase клиент.

## Решение

Есть два способа исправить это:

### Способ 1: Выполнить SQL функцию (РЕКОМЕНДУЕТСЯ)

1. Откройте Supabase Dashboard → SQL Editor
2. Выполните следующую SQL функцию (она уже есть в `supabase-setup.sql`, строки 110-144):

```sql
CREATE OR REPLACE FUNCTION delete_section_with_vectors(section_uuid UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Выполняется с правами создателя функции (обходит RLS)
AS $$
DECLARE
  deleted_vectors_count INTEGER;
  deleted_section_count INTEGER;
  result JSONB;
BEGIN
  -- Удаляем все векторы связанные с разделом
  DELETE FROM ai_vectors WHERE section_id = section_uuid;
  GET DIAGNOSTICS deleted_vectors_count = ROW_COUNT;
  
  -- Удаляем сам раздел
  DELETE FROM ai_sections WHERE id = section_uuid;
  GET DIAGNOSTICS deleted_section_count = ROW_COUNT;
  
  -- Возвращаем результат
  result := jsonb_build_object(
    'success', true,
    'deleted_vectors', deleted_vectors_count,
    'deleted_sections', deleted_section_count
  );
  
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;
```

После выполнения этой функции удаление будет работать автоматически через API.

### Способ 2: Добавить SUPABASE_SERVICE_ROLE_KEY

1. Откройте Supabase Dashboard → Settings → API
2. Скопируйте `service_role` key (секретный ключ)
3. Добавьте в `.env.local`:
   ```
   SUPABASE_SERVICE_ROLE_KEY=ваш_service_role_ключ
   ```
4. Перезапустите dev сервер

## Проверка

После применения одного из способов попробуйте удалить раздел через админ-панель. Удаление должно работать корректно.
