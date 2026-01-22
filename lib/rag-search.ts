import { openai } from './openai';
import { getSupabaseAdmin } from './supabase-admin';

/**
 * Поиск релевантных чанков в Supabase с использованием RAG
 */
export async function searchRelevantChunks(
  query: string,
  limit: number = 5
): Promise<Array<{ text: string; sectionId: string; sectionName?: string }>> {
  try {
    // Создаем эмбеддинг для запроса
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    if (!queryEmbedding || queryEmbedding.length === 0) {
      console.warn('Empty embedding for query:', query);
      return [];
    }

    // Используем admin клиент для поиска (обходит RLS если нужно)
    const supabase = getSupabaseAdmin();

    // Пробуем использовать RPC функцию для поиска векторов
    let data: any[] | null = null;
    let error: any = null;

    try {
      const rpcResult = await supabase.rpc('match_vectors', {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: limit,
      });
      data = rpcResult.data;
      error = rpcResult.error;
    } catch (rpcErr) {
      console.log('RPC function not available, using direct query');
      error = rpcErr;
    }

    // Если RPC функция не работает, используем прямой запрос с cosine similarity
    if (error) {
      console.log('Using direct vector search query');
      
      // Получаем все векторы и вычисляем схожесть на клиенте
      // (В продакшене лучше использовать RPC функцию для производительности)
      const { data: allVectors, error: vectorsError } = await supabase
        .from('ai_vectors')
        .select('id, content, section_id, embedding, ai_sections(name)')
        .limit(1000); // Ограничиваем для производительности

      if (vectorsError || !allVectors) {
        console.error('Error fetching vectors:', vectorsError);
        return [];
      }

      // Вычисляем cosine similarity для каждого вектора
      const similarities = allVectors
        .map((vector: any) => {
          if (!vector.embedding || !Array.isArray(vector.embedding)) {
            return null;
          }

          // Cosine similarity
          const dotProduct = queryEmbedding.reduce(
            (sum, val, i) => sum + val * (vector.embedding[i] || 0),
            0
          );
          const queryMagnitude = Math.sqrt(
            queryEmbedding.reduce((sum, val) => sum + val * val, 0)
          );
          const vectorMagnitude = Math.sqrt(
            vector.embedding.reduce((sum: number, val: number) => sum + val * val, 0)
          );

          if (vectorMagnitude === 0) return null;

          const similarity = dotProduct / (queryMagnitude * vectorMagnitude);
          return {
            ...vector,
            similarity,
          };
        })
        .filter((item: any) => item !== null && item.similarity >= 0.7)
        .sort((a: any, b: any) => b.similarity - a.similarity)
        .slice(0, limit);

      data = similarities;
    }

    // Получаем названия разделов для найденных чанков
    const sectionIdsSet = new Set((data || []).map((item: any) => item.section_id));
    const sectionIds = Array.from(sectionIdsSet);
    const sectionMap: Record<string, string> = {};

    if (sectionIds.length > 0) {
      const { data: sections } = await supabase
        .from('ai_sections')
        .select('id, name')
        .in('id', sectionIds);

      if (sections) {
        sections.forEach((section: any) => {
          sectionMap[section.id] = section.name;
        });
      }
    }

    // Форматируем результаты
    return (data || []).map((item: any) => ({
      text: item.content || '',
      sectionId: item.section_id || '',
      sectionName: sectionMap[item.section_id] || '',
    }));
  } catch (error: any) {
    console.error('RAG search error:', error);
    return [];
  }
}
