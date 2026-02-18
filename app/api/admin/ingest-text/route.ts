import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { createEmbeddings } from '@/lib/embeddings';

export const dynamic = 'force-dynamic';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

// Те же константы и логика, что в transcribe (чанки 1000 символов, перекрытие 200, разбиение по границам предложений)
const CHUNK_SIZE = 1000;
const OVERLAP = 200;
const EMBEDDING_BATCH_SIZE = 10;
const MIN_CHUNK_SIZE = 50;

export async function POST(request: NextRequest) {
  if (!(await checkAdminAuth())) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { sectionId?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Неверный JSON в теле запроса' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { sectionId, text } = body;
  if (!sectionId || typeof sectionId !== 'string') {
    return new Response(
      JSON.stringify({ error: 'Не указан раздел (sectionId)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (text === undefined || text === null) {
    return new Response(
      JSON.stringify({ error: 'Не указан текст (text)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const textStr = String(text).trim();
  if (textStr.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Текст пустой' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { data: section, error: sectionError } = await supabase
    .from('ai_sections')
    .select('*')
    .eq('id', sectionId)
    .single();

  if (sectionError || !section) {
    return new Response(
      JSON.stringify({ error: 'Раздел не найден' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Та же логика чанкинга, что в transcribe: 1000 символов, перекрытие 200, разбиение по границам предложений
  let start = 0;
  let chunkIndex = 0;
  let processedCount = 0;
  const batchTexts: string[] = [];
  const batchIndices: number[] = [];

  while (start < textStr.length) {
    const end = Math.min(start + CHUNK_SIZE, textStr.length);
    let chunkText = textStr.slice(start, end);
    let actualEnd = end;

    if (end < textStr.length && chunkText.length >= CHUNK_SIZE * 0.8) {
      const sentenceEndPatterns = ['. ', '! ', '? ', '.\n', '!\n', '?\n', '.', '!', '?'];
      let lastSentenceEnd = -1;
      for (const pattern of sentenceEndPatterns) {
        const pos = chunkText.lastIndexOf(pattern);
        if (pos > lastSentenceEnd && pos > CHUNK_SIZE * 0.7) {
          lastSentenceEnd = pos + pattern.length;
        }
      }
      if (lastSentenceEnd > CHUNK_SIZE * 0.7) {
        chunkText = chunkText.slice(0, lastSentenceEnd);
        actualEnd = start + lastSentenceEnd;
      }
    }

    chunkText = chunkText.trim();

    if (chunkText.length >= MIN_CHUNK_SIZE) {
      batchTexts.push(chunkText);
      batchIndices.push(chunkIndex);
      chunkIndex++;

      start = actualEnd - OVERLAP;
      if (start < 0) start = 0;
      if (start === actualEnd - OVERLAP && actualEnd === end && start >= end - OVERLAP) {
        start = end;
      }
    } else {
      start = actualEnd;
    }

    if (start >= textStr.length) break;

    if (batchTexts.length >= EMBEDDING_BATCH_SIZE) {
      const batchEmbeddings = await createEmbeddings(batchTexts);
      const batchRecords = batchTexts.map((text, batchIndex) => ({
        section_id: sectionId,
        content: text,
        embedding: batchEmbeddings[batchIndex],
        metadata: {
          chunk_index: batchIndices[batchIndex],
          total_chunks: chunkIndex,
          source: 'text',
          created_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from('ai_vectors')
        .insert(batchRecords);

      if (insertError) {
        console.error('ingest-text insert error:', insertError);
        return new Response(
          JSON.stringify({
            error: 'Ошибка при сохранении в базу',
            details: insertError.message,
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
      processedCount += batchRecords.length;
      batchTexts.length = 0;
      batchIndices.length = 0;
    }
  }

  if (batchTexts.length > 0) {
    const batchEmbeddings = await createEmbeddings(batchTexts);
    const batchRecords = batchTexts.map((text, batchIndex) => ({
      section_id: sectionId,
      content: text,
      embedding: batchEmbeddings[batchIndex],
      metadata: {
        chunk_index: batchIndices[batchIndex],
        total_chunks: chunkIndex,
        source: 'text',
        created_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from('ai_vectors')
      .insert(batchRecords);

    if (insertError) {
      console.error('ingest-text insert error:', insertError);
      return new Response(
        JSON.stringify({
          error: 'Ошибка при сохранении в базу',
          details: insertError.message,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    processedCount += batchRecords.length;
  }

  if (processedCount === 0) {
    return new Response(
      JSON.stringify({ error: 'После разбиения не осталось чанков (минимум 50 символов)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  await supabase
    .from('ai_sections')
    .update({
      total_chunks: (section.total_chunks || 0) + processedCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sectionId);

  return new Response(
    JSON.stringify({
      success: true,
      chunksCount: processedCount,
      message: `Добавлено ${processedCount} чанков с эмбеддингами.`,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
