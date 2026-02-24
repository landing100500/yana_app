-- Скрипт для настройки Supabase для работы с векторными данными
-- Выполните этот скрипт в SQL Editor вашего Supabase проекта

-- 1. Включаем расширение pgvector (если еще не включено)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Создаем таблицу для разделов обучения ИИ
CREATE TABLE IF NOT EXISTS ai_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  total_chunks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Создаем таблицу для векторных данных
-- Используем тип vector для хранения эмбеддингов (1536 размерность для text-embedding-3-small)
CREATE TABLE IF NOT EXISTS ai_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES ai_sections(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL, -- Размерность для text-embedding-3-small
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Создаем индексы для быстрого поиска
-- HNSW индекс для векторного поиска (более быстрый, но занимает больше места)
CREATE INDEX IF NOT EXISTS ai_vectors_embedding_idx ON ai_vectors 
USING hnsw (embedding vector_cosine_ops);

-- Индекс для фильтрации по разделу
CREATE INDEX IF NOT EXISTS ai_vectors_section_id_idx ON ai_vectors(section_id);

-- Индекс для поиска по содержимому (опционально)
CREATE INDEX IF NOT EXISTS ai_vectors_content_idx ON ai_vectors USING gin(to_tsvector('russian', content));

-- 5. Создаем функцию для поиска похожих векторов
CREATE OR REPLACE FUNCTION match_vectors(
  query_embedding vector(1536),
  match_section_id UUID DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  section_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ai_vectors.id,
    ai_vectors.section_id,
    ai_vectors.content,
    ai_vectors.metadata,
    1 - (ai_vectors.embedding <=> query_embedding) AS similarity
  FROM ai_vectors
  WHERE 
    (match_section_id IS NULL OR ai_vectors.section_id = match_section_id)
    AND (1 - (ai_vectors.embedding <=> query_embedding)) > match_threshold
  ORDER BY ai_vectors.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 6. Создаем RLS (Row Level Security) политики (опционально, для безопасности)
-- Включаем RLS
ALTER TABLE ai_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_vectors ENABLE ROW LEVEL SECURITY;

-- Политика для чтения (все могут читать)
CREATE POLICY "Allow read access" ON ai_sections FOR SELECT USING (true);
CREATE POLICY "Allow read access" ON ai_vectors FOR SELECT USING (true);

-- Политика для записи
-- ВАЖНО: Для продакшена рекомендуется использовать сервисный ключ (service_role key)
-- вместо анонимного ключа для админ-панели, или настроить аутентификацию через Supabase Auth
-- Временная политика разрешает запись всем (для разработки)
CREATE POLICY "Allow insert access" ON ai_sections FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update access" ON ai_sections FOR UPDATE USING (true);
CREATE POLICY "Allow delete access" ON ai_sections FOR DELETE USING (true);
CREATE POLICY "Allow insert access" ON ai_vectors FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow delete access" ON ai_vectors FOR DELETE USING (true);

-- Для продакшена замените на:
-- CREATE POLICY "Allow admin insert" ON ai_sections FOR INSERT 
--   WITH CHECK (auth.role() = 'service_role');
-- CREATE POLICY "Allow admin insert" ON ai_vectors FOR INSERT 
--   WITH CHECK (auth.role() = 'service_role');

-- 7. Создаем функцию для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ai_sections_updated_at
  BEFORE UPDATE ON ai_sections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 8. Создаем функцию для безопасного удаления раздела и всех связанных данных
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

-- 9. Добавляем поле description к существующим таблицам (если его еще нет)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_sections' AND column_name = 'description'
  ) THEN
    ALTER TABLE ai_sections ADD COLUMN description TEXT;
  END IF;
END $$;

-- 10. Подключение областей памяти к агенту (enabled_for_agent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_sections' AND column_name = 'enabled_for_agent'
  ) THEN
    ALTER TABLE ai_sections ADD COLUMN enabled_for_agent BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Готово! Теперь база данных настроена для работы с векторными данными
