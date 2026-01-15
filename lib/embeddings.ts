import { openai } from './openai';

export interface TextChunk {
  text: string;
  metadata?: Record<string, any>;
}

/**
 * Разбивает текст на чанки с перекрытием
 */
export function splitTextIntoChunks(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let start = 0;
  
  // Защита от слишком большого количества чанков
  const maxChunks = 100000; // Максимум 100k чанков
  let iterationCount = 0;

  while (start < text.length && iterationCount < maxChunks) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end);
    const trimmedChunk = chunk.trim();
    
    // Добавляем только непустые чанки
    if (trimmedChunk.length > 0) {
      chunks.push({
        text: trimmedChunk,
      });
    }

    // Переходим к следующему чанку с учетом перекрытия
    const nextStart = end - overlap;
    
    // Защита от бесконечного цикла: если следующий start не больше текущего, увеличиваем на минимальный шаг
    if (nextStart <= start) {
      start = start + 1;
    } else {
      start = nextStart;
    }
    
    iterationCount++;
    
    // Дополнительная проверка выхода
    if (start >= text.length) break;
  }

  if (iterationCount >= maxChunks) {
    console.warn(`Reached max chunks limit (${maxChunks}), stopping chunking`);
  }

  return chunks;
}

/**
 * Создает эмбеддинг для текста
 */
export async function createEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * Создает эмбеддинги для массива текстов
 * Для больших массивов используйте батчинг на уровне вызова
 */
export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  // OpenAI API поддерживает до 2048 текстов за раз, но для экономии памяти используем меньшие батчи
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  });

  return response.data.map(item => item.embedding);
}
