import { openai } from './openai';
import { getSupabaseAdmin } from './supabase-admin';

/**
 * Поиск раздела по имени
 */
export async function findSectionByName(sectionName: string): Promise<{ id: string; name: string } | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('ai_sections')
      .select('id, name')
      .eq('name', sectionName)
      .single();

    if (error || !data) {
      console.warn(`Section "${sectionName}" not found:`, error?.message);
      return null;
    }

    return { id: data.id, name: data.name };
  } catch (error: any) {
    console.error('Error finding section:', error);
    return null;
  }
}

/**
 * Получение репрезентативных чанков из раздела для извлечения стилистики
 */
export async function getSectionStyleChunks(
  sectionId: string,
  limit: number = 5
): Promise<Array<{ text: string; sectionId: string; sectionName?: string }>> {
  try {
    const supabase = getSupabaseAdmin();
    
    // Получаем случайные чанки из раздела для понимания стилистики
    const { data, error } = await supabase
      .from('ai_vectors')
      .select('id, content, section_id, ai_sections(name)')
      .eq('section_id', sectionId)
      .limit(limit * 2); // Берем больше, чтобы потом выбрать лучшие

    if (error || !data || data.length === 0) {
      console.warn(`No chunks found for section ${sectionId}`);
      return [];
    }

    // Выбираем разнообразные чанки (можно рандомизировать или брать первые)
    const selectedChunks = data.slice(0, limit);
    
    const sectionName = selectedChunks[0]?.ai_sections?.name || '';

    return selectedChunks.map((chunk: any) => ({
      text: chunk.content || '',
      sectionId: chunk.section_id || '',
      sectionName,
    }));
  } catch (error: any) {
    console.error('Error getting section style chunks:', error);
    return [];
  }
}

/**
 * Поиск релевантных чанков в Supabase с использованием RAG
 * Всегда включает чанки из обязательного раздела (если указан)
 */
export async function searchRelevantChunks(
  query: string,
  limit: number = 5,
  requiredSectionName?: string
): Promise<Array<{ text: string; sectionId: string; sectionName?: string }>> {
  // Объявляем переменные вне try-catch для доступа в catch блоке
  let requiredChunks: Array<{ text: string; sectionId: string; sectionName?: string }> = [];
  
  try {
    // Если указан обязательный раздел, находим его
    let requiredSection: { id: string; name: string } | null = null;
    
    if (requiredSectionName) {
      requiredSection = await findSectionByName(requiredSectionName);
      if (requiredSection) {
        console.log(`Found required section "${requiredSectionName}" with ID: ${requiredSection.id}`);
        // Получаем релевантные чанки из обязательного раздела
        requiredChunks = await searchChunksInSection(query, requiredSection.id, Math.max(3, Math.floor(limit / 2)));
      }
    }

    // Создаем эмбеддинг для запроса
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    if (!queryEmbedding || queryEmbedding.length === 0) {
      console.warn('Empty embedding for query:', query);
      // Если есть обязательные чанки, возвращаем их
      return requiredChunks;
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

    // Форматируем результаты из общего поиска
    const generalChunks = (data || []).map((item: any) => ({
      text: item.content || '',
      sectionId: item.section_id || '',
      sectionName: sectionMap[item.section_id] || '',
    }));

    // Объединяем обязательные чанки с общими, убирая дубликаты
    const allChunks = [...requiredChunks];
    const usedTexts = new Set(requiredChunks.map(c => c.text));
    
    for (const chunk of generalChunks) {
      if (!usedTexts.has(chunk.text)) {
        allChunks.push(chunk);
        usedTexts.add(chunk.text);
      }
    }

    // Ограничиваем общее количество чанков
    return allChunks.slice(0, limit);
  } catch (error: any) {
    console.error('RAG search error:', error);
    // Если есть обязательные чанки, возвращаем их даже при ошибке
    return requiredChunks;
  }
}

/**
 * Поиск релевантных чанков в конкретном разделе
 */
async function searchChunksInSection(
  query: string,
  sectionId: string,
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
      return [];
    }

    const supabase = getSupabaseAdmin();

    // Получаем все векторы из указанного раздела
    const { data: sectionVectors, error: vectorsError } = await supabase
      .from('ai_vectors')
      .select('id, content, section_id, embedding, ai_sections(name)')
      .eq('section_id', sectionId)
      .limit(500); // Ограничиваем для производительности

    if (vectorsError || !sectionVectors || sectionVectors.length === 0) {
      console.warn(`No vectors found in section ${sectionId}`);
      return [];
    }

    // Вычисляем cosine similarity для каждого вектора
    const similarities = sectionVectors
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
      .filter((item: any) => item !== null && item.similarity >= 0.5) // Более низкий порог для обязательного раздела
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, limit);

    const sectionName = sectionVectors[0]?.ai_sections?.name || '';

    return similarities.map((item: any) => ({
      text: item.content || '',
      sectionId: item.section_id || '',
      sectionName,
    }));
  } catch (error: any) {
    console.error('Error searching chunks in section:', error);
    return [];
  }
}
