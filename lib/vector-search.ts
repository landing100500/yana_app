import { supabase } from './supabase';
import { createEmbedding } from './embeddings';

/**
 * Поиск похожих векторов в базе данных
 */
export async function searchSimilarVectors(
  query: string,
  sectionId?: string,
  threshold: number = 0.5,
  limit: number = 10
) {
  // Создаем эмбеддинг для запроса
  const queryEmbedding = await createEmbedding(query);

  // Вызываем функцию поиска в Supabase
  const { data, error } = await supabase.rpc('match_vectors', {
    query_embedding: queryEmbedding,
    match_section_id: sectionId || null,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    throw new Error(`Vector search error: ${error.message}`);
  }

  return data || [];
}

/**
 * Получить все векторы для раздела
 */
export async function getSectionVectors(sectionId: string, limit: number = 100) {
  const { data, error } = await supabase
    .from('ai_vectors')
    .select('*')
    .eq('section_id', sectionId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Get vectors error: ${error.message}`);
  }

  return data || [];
}
