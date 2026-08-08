import { openai } from './openai';
import { getSupabaseAdmin } from './supabase-admin';

export type RagChunk = { text: string; sectionId: string; sectionName?: string };

export type SectionAgentStatus =
  | 'ok'
  | 'not_found'
  | 'disabled'
  | 'empty_rag'
  | 'no_agent_sections';

export interface SectionChunksFetchResult {
  chunks: RagChunk[];
  status: SectionAgentStatus;
  requestedName: string;
  sectionName?: string;
  sectionId?: string;
}

const DEFAULT_SIMILARITY = 0.35;
const FALLBACK_SIMILARITY = 0.25;

/** Нормализация для сравнения имён разделов */
export function normalizeSectionNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[«»"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMatchKeywords(sectionName: string): string[] {
  const normalized = normalizeSectionNameForMatch(sectionName);
  const stop = new Set(['книга', 'часть', 'про', 'тип', 'характера']);
  return normalized
    .split(/[^a-zа-яё0-9]+/i)
    .filter((w) => w.length >= 3 && !stop.has(w));
}

/** Термины для ilike: ключевые слова + префиксы длинных токенов (чаракарок → чара) */
function buildSectionSearchTerms(sectionName: string): string[] {
  const keywords = extractMatchKeywords(sectionName);
  const terms = new Set<string>();
  for (const kw of keywords) {
    terms.add(kw);
    if (kw.length >= 6) terms.add(kw.slice(0, 4));
  }
  return Array.from(terms);
}

export function scoreSectionNameMatch(requested: string, candidate: string): number {
  const a = normalizeSectionNameForMatch(requested);
  const b = normalizeSectionNameForMatch(candidate);
  if (a === b) return 100;
  if (b.includes(a) || a.includes(b)) return 85;

  const wordsA = extractMatchKeywords(requested);
  const wordsB = new Set(extractMatchKeywords(candidate));
  if (wordsA.length === 0) return 0;

  let hits = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) hits += 1;
    else if (Array.from(wordsB).some((bw) => bw.includes(w) || w.includes(bw))) hits += 0.7;
  }
  return Math.round((hits / wordsA.length) * 80);
}

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
 * Поиск раздела по имени: точное совпадение, затем fuzzy по ключевым словам.
 */
export async function findSectionByName(
  sectionName: string
): Promise<{ id: string; name: string; enabled_for_agent?: boolean } | null> {
  try {
    const supabase = getSupabaseAdmin();

    const { data: exact, error: exactError } = await supabase
      .from('ai_sections')
      .select('id, name, enabled_for_agent')
      .eq('name', sectionName)
      .maybeSingle();

    if (!exactError && exact) return exact;

    const searchTerms = buildSectionSearchTerms(sectionName);
    if (searchTerms.length === 0) {
      console.warn(`Section "${sectionName}" not found (no keywords for fuzzy match)`);
      return null;
    }

    const byId = new Map<string, { id: string; name: string; enabled_for_agent?: boolean }>();
    for (const term of searchTerms) {
      const { data: batch, error: candError } = await supabase
        .from('ai_sections')
        .select('id, name, enabled_for_agent')
        .ilike('name', `%${term}%`)
        .limit(40);
      if (candError) {
        console.warn(`Section "${sectionName}" ilike error:`, candError.message);
        continue;
      }
      for (const row of batch || []) {
        byId.set(row.id, row);
      }
      if (byId.size >= 5) break;
    }

    const candidates = Array.from(byId.values());
    if (!candidates.length) {
      console.warn(`Section "${sectionName}" not found: no candidates`);
      return null;
    }

    let best: (typeof candidates)[0] | null = null;
    let bestScore = 0;
    for (const row of candidates) {
      const score = scoreSectionNameMatch(sectionName, row.name);
      if (score > bestScore) {
        bestScore = score;
        best = row;
      }
    }

    if (best && bestScore >= 45) {
      if (best.name !== sectionName) {
        console.log(`RAG fuzzy section match: "${sectionName}" -> "${best.name}" (score ${bestScore})`);
      }
      return best;
    }

    console.warn(`Section "${sectionName}" not found (best score ${bestScore})`);
    return null;
  } catch (error: unknown) {
    console.error('Error finding section:', error);
    return null;
  }
}

/**
 * Подсказка для системного промпта: раздел не найден / отключён / подключён, но чанки не подобрались.
 */
export function formatSectionMemoryHint(label: string, result: SectionChunksFetchResult): string {
  if (result.status === 'ok') return '';

  const meta =
    'Это служебная пометка только для тебя. Пользователю не называй разделы, «области памяти», админку и RAG.';

  if (result.status === 'not_found') {
    return (
      `\n--- Статус области «${label}»: раздел «${result.requestedName}» не найден в базе памяти. ` +
      `Не утверждай, что он подключён; опирайся на другие фрагменты и данные карты. ${meta} ---\n`
    );
  }
  if (result.status === 'disabled') {
    return (
      `\n--- Статус области «${label}»: раздел «${result.sectionName}» есть в базе, но не подключён к агенту ` +
      `(enabled_for_agent=false). Внутренне учти отсутствие раздела; пользователю не сообщай про отключение. ` +
      `Отвечай по данным карты и другим фрагментам. ${meta} ---\n`
    );
  }
  if (result.status === 'empty_rag') {
    return (
      `\n--- Статус области «${label}»: раздел «${result.sectionName}» подключён к агенту, ` +
      `но релевантные фрагменты для этого запроса не подобрались. Не утверждай, что раздела нет; ` +
      `используй данные натальной карты, расчётные транзиты и другие переданные блоки. ${meta} ---\n`
    );
  }
  return '';
}

/**
 * Получение репрезентативных чанков из раздела для извлечения стилистики
 */
export async function getSectionStyleChunks(
  sectionId: string,
  limit: number = 5
): Promise<RagChunk[]> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('ai_vectors')
      .select('id, content, section_id, ai_sections(name)')
      .eq('section_id', sectionId)
      .limit(limit * 2);

    if (error || !data || data.length === 0) {
      console.warn(`No chunks found for section ${sectionId}`);
      return [];
    }

    const selectedChunks = data.slice(0, limit);
    const sectionName =
      (selectedChunks[0] as { ai_sections?: { name?: string } | null })?.ai_sections?.name || '';

    return selectedChunks.map((chunk: { content?: string; section_id?: string }) => ({
      text: chunk.content || '',
      sectionId: chunk.section_id || '',
      sectionName,
    }));
  } catch (error: unknown) {
    console.error('Error getting section style chunks:', error);
    return [];
  }
}

async function searchChunksInSection(
  query: string,
  sectionId: string,
  limit: number,
  minSimilarity: number
): Promise<RagChunk[]> {
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
      match_threshold: minSimilarity,
      match_count: limit,
    });

    if (rpcError) {
      console.warn('searchChunksInSection RPC error:', rpcError.message);
      return [];
    }
    if (!rpcRows?.length) return [];

    return (rpcRows as { content?: string; section_id?: string; section_name?: string }[]).map((row) => ({
      text: row.content || '',
      sectionId: row.section_id || '',
      sectionName: row.section_name ?? undefined,
    }));
  } catch (error: unknown) {
    console.error('Error searching chunks in section:', error);
    return [];
  }
}

async function searchChunksInSectionWithRetry(
  query: string,
  sectionId: string,
  limit: number,
  primaryThreshold: number = DEFAULT_SIMILARITY,
  fallbackThreshold: number = FALLBACK_SIMILARITY
): Promise<RagChunk[]> {
  let chunks = await searchChunksInSection(query, sectionId, limit, primaryThreshold);
  if (chunks.length === 0 && fallbackThreshold < primaryThreshold) {
    chunks = await searchChunksInSection(query, sectionId, limit, fallbackThreshold);
  }
  return chunks;
}

/**
 * Загрузка чанков из именованного раздела с retry порога и несколькими запросами.
 */
export async function fetchSectionChunks(
  sectionName: string,
  queries: string | string[],
  limit: number = 5,
  options?: { minSimilarity?: number; fallbackMinSimilarity?: number }
): Promise<SectionChunksFetchResult> {
  const requestedName = sectionName;
  const queryList = (Array.isArray(queries) ? queries : [queries]).filter((q) => q?.trim());

  const enabledIds = await getEnabledSectionIds();
  if (enabledIds.length === 0) {
    return { chunks: [], status: 'no_agent_sections', requestedName };
  }

  const section = await findSectionByName(sectionName);
  if (!section) {
    return { chunks: [], status: 'not_found', requestedName };
  }

  if (!enabledIds.includes(section.id)) {
    return {
      chunks: [],
      status: 'disabled',
      requestedName,
      sectionName: section.name,
      sectionId: section.id,
    };
  }

  const primary = options?.minSimilarity ?? DEFAULT_SIMILARITY;
  const fallback = options?.fallbackMinSimilarity ?? FALLBACK_SIMILARITY;

  let chunks: RagChunk[] = [];
  for (const q of queryList) {
    chunks = await searchChunksInSectionWithRetry(q, section.id, limit, primary, fallback);
    if (chunks.length > 0) break;
  }

  if (chunks.length === 0) {
    return {
      chunks: [],
      status: 'empty_rag',
      requestedName,
      sectionName: section.name,
      sectionId: section.id,
    };
  }

  return {
    chunks,
    status: 'ok',
    requestedName,
    sectionName: section.name,
    sectionId: section.id,
  };
}

/**
 * Получить релевантные чанки из раздела по имени (только если раздел подключён к агенту).
 */
export async function getChunksFromSectionByName(
  sectionName: string,
  query: string,
  limit: number = 5
): Promise<RagChunk[]> {
  const result = await fetchSectionChunks(sectionName, query, limit);
  return result.chunks;
}

/**
 * Поиск релевантных чанков через БД (RPC match_vectors_multi).
 */
export async function searchRelevantChunks(
  query: string,
  limit: number = 5,
  requiredSectionName?: string,
  options?: { minSimilarity?: number }
): Promise<RagChunk[]> {
  let requiredChunks: RagChunk[] = [];
  const minSimilarity = options?.minSimilarity ?? DEFAULT_SIMILARITY;
  const fallbackSimilarity = minSimilarity > FALLBACK_SIMILARITY ? FALLBACK_SIMILARITY : minSimilarity;

  try {
    const enabledIds = await getEnabledSectionIds();
    if (enabledIds.length === 0) {
      console.log('RAG: no sections connected to agent, returning empty chunks');
      return [];
    }

    if (requiredSectionName) {
      const requiredSection = await findSectionByName(requiredSectionName);
      if (requiredSection && enabledIds.includes(requiredSection.id)) {
        requiredChunks = await searchChunksInSectionWithRetry(
          query,
          requiredSection.id,
          Math.max(3, Math.floor(limit / 2)),
          minSimilarity,
          fallbackSimilarity
        );
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

    const generalChunks = (rpcRows || []).map(
      (row: { content?: string; section_id?: string; section_name?: string }) => ({
        text: row.content || '',
        sectionId: row.section_id || '',
        sectionName: row.section_name ?? undefined,
      })
    );

    const allChunks = [...requiredChunks];
    const usedTexts = new Set(requiredChunks.map((c) => c.text));
    for (const chunk of generalChunks) {
      if (!usedTexts.has(chunk.text)) {
        allChunks.push(chunk);
        usedTexts.add(chunk.text);
      }
    }
    return allChunks.slice(0, limit);
  } catch (error: unknown) {
    console.error('RAG search error:', error);
    return requiredChunks;
  }
}
