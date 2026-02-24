import { openai } from './openai';
import { getSupabaseAdmin } from './supabase-admin';

/**
 * ID разделов, подключённых к агенту (enabled_for_agent = true)
 */
export async function getEnabledSectionIds(): Promise<string[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('ai_sections')
      .select('id')
      .eq('enabled_for_agent', true);
    if (error || !data) return [];
    return (data as { id: string }[]).map((r) => r.id);
  } catch {
    return [];
  }
}

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
 * Учитываются только разделы, подключённые к агенту (enabled_for_agent = true).
 * Если ни один раздел не подключён, возвращается пустой массив.
 */
export async function searchRelevantChunks(
  query: string,
  limit: number = 5,
  requiredSectionName?: string
): Promise<Array<{ text: string; sectionId: string; sectionName?: string }>> {
  let requiredChunks: Array<{ text: string; sectionId: string; sectionName?: string }> = [];

  try {
    const enabledIds = await getEnabledSectionIds();
    if (enabledIds.length === 0) {
      console.log('RAG: no sections connected to agent, returning empty chunks');
      return [];
    }

    if (requiredSectionName) {
      const requiredSection = await findSectionByName(requiredSectionName);
      if (requiredSection && enabledIds.includes(requiredSection.id)) {
        requiredChunks = await searchChunksInSection(query, requiredSection.id, Math.max(3, Math.floor(limit / 2)));
      }
    }

    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;
    if (!queryEmbedding || queryEmbedding.length === 0) return requiredChunks;

    const supabase = getSupabaseAdmin();

    // Поиск только по подключённым разделам (фильтр по section_id)
    const { data: allVectors, error: vectorsError } = await supabase
      .from('ai_vectors')
      .select('id, content, section_id, embedding, ai_sections(name)')
      .in('section_id', enabledIds)
      .limit(1000);

    if (vectorsError || !allVectors) {
      console.error('Error fetching vectors:', vectorsError);
      return requiredChunks;
    }

    const similarities = allVectors
      .map((vector: any) => {
        if (!vector.embedding || !Array.isArray(vector.embedding)) return null;
        const dotProduct = queryEmbedding.reduce(
          (sum, val, i) => sum + val * (vector.embedding[i] || 0),
          0
        );
        const queryMagnitude = Math.sqrt(queryEmbedding.reduce((sum, val) => sum + val * val, 0));
        const vectorMagnitude = Math.sqrt(
          vector.embedding.reduce((sum: number, val: number) => sum + val * val, 0)
        );
        if (vectorMagnitude === 0) return null;
        return { ...vector, similarity: dotProduct / (queryMagnitude * vectorMagnitude) };
      })
      .filter((item: any) => item !== null && item.similarity >= 0.7)
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, limit);

    const sectionIdsSet = new Set(similarities.map((item: any) => item.section_id));
    const sectionMap: Record<string, string> = {};
    if (sectionIdsSet.size > 0) {
      const { data: sections } = await supabase
        .from('ai_sections')
        .select('id, name')
        .in('id', Array.from(sectionIdsSet));
      if (sections) {
        (sections as { id: string; name: string }[]).forEach((s) => { sectionMap[s.id] = s.name; });
      }
    }

    const generalChunks = similarities.map((item: any) => ({
      text: item.content || '',
      sectionId: item.section_id || '',
      sectionName: sectionMap[item.section_id] || '',
    }));

    const allChunks = [...requiredChunks];
    const usedTexts = new Set(requiredChunks.map((c) => c.text));
    for (const chunk of generalChunks) {
      if (!usedTexts.has(chunk.text)) {
        allChunks.push(chunk);
        usedTexts.add(chunk.text);
      }
    }
    return allChunks.slice(0, limit);
  } catch (error: any) {
    console.error('RAG search error:', error);
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
