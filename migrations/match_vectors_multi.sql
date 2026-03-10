-- Поиск по вектору в нескольких разделах (поиск в БД по индексу).
-- Выполнить в Supabase SQL Editor, если функция ещё не создана (например, после обновления supabase-setup.sql).
CREATE OR REPLACE FUNCTION match_vectors_multi(
  query_embedding vector(1536),
  section_ids UUID[],
  match_threshold FLOAT DEFAULT 0.35,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  section_id UUID,
  content TEXT,
  section_name TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    av.id,
    av.section_id,
    av.content,
    s.name::TEXT AS section_name,
    (1 - (av.embedding <=> query_embedding))::FLOAT AS similarity
  FROM ai_vectors av
  JOIN ai_sections s ON s.id = av.section_id
  WHERE
    av.section_id = ANY(section_ids)
    AND (1 - (av.embedding <=> query_embedding)) > match_threshold
  ORDER BY av.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
