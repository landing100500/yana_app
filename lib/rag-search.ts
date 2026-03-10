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
 * Поиск релевантных чанков через БД (RPC match_vectors_multi).
 * Поиск по индексу в Supabase — быстро при большом числе чанков, без выгрузки векторов в Node.
 */
export async function searchRelevantChunks(
  query: string,
  limit: number = 5,
  requiredSectionName?: string,
  options?: { minSimilarity?: number }
): Promise<Array<{ text: string; sectionId: string; sectionName?: string }>> {
  let requiredChunks: Array<{ text: string; sectionId: string; sectionName?: string }> = [];
  const minSimilarity = options?.minSimilarity ?? 0.35;

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

    const { data: rpcRows, error: rpcError } = await supabase.rpc('match_vectors_multi', {
      query_embedding: queryEmbedding,
      section_ids: enabledIds,
      match_threshold: minSimilarity,
      match_count: limit,
    });

    if (rpcError) {
      console.error('RAG RPC match_vectors_multi error:', rpcError);
      return requiredChunks;
    }

    const generalChunks = (rpcRows || []).map((row: { content?: string; section_id?: string; section_name?: string }) => ({
      text: row.content || '',
      sectionId: row.section_id || '',
      sectionName: row.section_name ?? undefined,
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
 * Поиск релевантных чанков в одном разделе — через RPC в БД (по индексу).
 */
async function searchChunksInSection(
  query: string,
  sectionId: string,
  limit: number = 5
): Promise<Array<{ text: string; sectionId: string; sectionName?: string }>> {
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;
    if (!queryEmbedding || queryEmbedding.length === 0) return [];

    const supabase = getSupabaseAdmin();
    const { data: rpcRows, error: rpcError } = await supabase.rpc('match_vectors_multi', {
      query_embedding: queryEmbedding,
      section_ids: [sectionId],
      match_threshold: 0.35,
      match_count: limit,
    });

    if (rpcError || !rpcRows?.length) {
      if (rpcError) console.warn('searchChunksInSection RPC error:', rpcError.message);
      return [];
    }

    return (rpcRows as { content?: string; section_id?: string; section_name?: string }[]).map((row) => ({
      text: row.content || '',
      sectionId: row.section_id || '',
      sectionName: row.section_name ?? undefined,
    }));
  } catch (error: any) {
    console.error('Error searching chunks in section:', error);
    return [];
  }
}

/**
 * Получить релевантные чанки из раздела по его имени (только если раздел подключён к агенту).
 * Нужно, чтобы при вопросах о натальной карте всегда подтягивать, например, "Интерпретация натальной карты".
 */
export async function getChunksFromSectionByName(
  sectionName: string,
  query: string,
  limit: number = 5
): Promise<Array<{ text: string; sectionId: string; sectionName?: string }>> {
  const enabledIds = await getEnabledSectionIds();
  if (enabledIds.length === 0) return [];
  const section = await findSectionByName(sectionName);
  if (!section || !enabledIds.includes(section.id)) return [];
  return searchChunksInSection(query, section.id, limit);
}
