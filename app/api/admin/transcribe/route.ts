import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { openai } from '@/lib/openai';
import { splitTextIntoChunks, createEmbeddings } from '@/lib/embeddings';
import {
  extractAudioFromVideo,
  isVideoFile,
  getMediaDuration,
  extractAudioSegment,
  extractAudioFromVideoToFile,
} from '@/lib/audio-extractor';
import { readFile, unlink, stat, writeFile } from 'fs/promises';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import busboy from 'busboy';
import { Readable } from 'stream';

export const dynamic = 'force-dynamic';

// Настройка для больших файлов (до 2GB, сегментация по Whisper ≤25MB)
export const maxDuration = 3600; // 60 минут для файлов до 2GB
export const runtime = 'nodejs';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

const MAX_FILE_SIZE_MB = 2048;
const WHISPER_MAX_SIZE_MB = 25;
const SEGMENT_DURATION_SEC = 600; // 10 мин — сегмент ~10MB при 128kbps, под лимит Whisper 25MB

function sendProgress(controller: ReadableStreamDefaultController, message: string, progress?: number) {
  const data = JSON.stringify({ type: 'progress', message, progress });
  controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
}

async function transcribeBufferWithWhisper(
  buffer: Buffer,
  mimeType: string,
  segmentName: string
): Promise<string> {
  const arr = new Uint8Array(buffer);
  const file = new File([arr], segmentName, { type: mimeType });
  let retryCount = 0;
  const maxRetries = 3;
  while (retryCount < maxRetries) {
    try {
      const transcription = await openai.audio.transcriptions.create({
        file: file as any,
        model: 'whisper-1',
        language: 'ru',
        response_format: 'text',
      });
      if (typeof transcription === 'string') return transcription;
      if (transcription?.text) return transcription.text;
      return String(transcription);
    } catch (err: any) {
      const isConnectionError =
        err?.code === 'EPIPE' ||
        err?.message?.includes('Connection error') ||
        err?.message?.includes('fetch failed') ||
        err?.cause?.code === 'EPIPE';
      if (isConnectionError && retryCount < maxRetries - 1) {
        retryCount++;
        await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, retryCount - 1)));
        continue;
      }
      throw err;
    }
  }
  return '';
}

export async function POST(request: NextRequest) {
  if (!(await checkAdminAuth())) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let tempFilePath: string | null = null;
      
      try {
        sendProgress(controller, 'Загрузка файла...', 5);

        // Проверяем размер файла из заголовков
        const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
        const uploadFileSizeMB = contentLength / (1024 * 1024);
        const LARGE_FILE_THRESHOLD_MB = 10; // Для файлов >10MB используем потоковую обработку
        const KEEP_FILE_ON_DISK_OVER_MB = 50; // Файлы >50MB не грузим в память — обрабатываем по сегментам с диска

        let file: File | null = null;
        let sectionId: string = '';
        let largeFileFileName = '';
        let largeFileMimeType = '';

        // Для больших файлов используем busboy (потоковая обработка)
        // Для маленьких - стандартный formData (как раньше)
        if (uploadFileSizeMB > LARGE_FILE_THRESHOLD_MB) {
          console.log(`[TRANSCRIBE] Large file detected (${uploadFileSizeMB.toFixed(2)}MB), using streaming parser...`);
          sendProgress(controller, 'Потоковая загрузка большого файла...', 6);
          
          const tempDir = tmpdir();
          const tempFile = join(tempDir, `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`);
          tempFilePath = tempFile;
          
          let fileName = '';
          let fileType = '';
          let sectionIdValue = '';
          const writeStream = createWriteStream(tempFile);
          
          await new Promise<void>((resolve, reject) => {
            console.log('[TRANSCRIBE] Creating busboy parser...');
            const bb = busboy({
              headers: Object.fromEntries(request.headers.entries()),
              limits: {
                fileSize: 2048 * 1024 * 1024, // 2GB
              },
            });
            
            let fileStarted = false;
            
            bb.on('file', (name, stream, info) => {
              console.log(`[TRANSCRIBE] File event received: ${name}`);
              fileStarted = true;
              if (name === 'file') {
                fileName = info.filename || 'upload';
                fileType = info.mimeType || 'application/octet-stream';
                console.log(`[TRANSCRIBE] Streaming file to disk: ${fileName}, type: ${fileType}`);
                
                let bytesReceived = 0;
                const totalSize = contentLength;
                let lastProgressUpdate = Date.now();
                
                // Heartbeat каждые 10 секунд во время загрузки
                const heartbeatInterval = setInterval(() => {
                  const progress = totalSize > 0 ? Math.min(95, Math.round((bytesReceived / totalSize) * 90)) : undefined;
                  const message = `Загрузка файла... ${(bytesReceived / (1024 * 1024)).toFixed(2)}MB из ${uploadFileSizeMB.toFixed(2)}MB`;
                  try {
                    sendProgress(controller, message, progress);
                  } catch (e) {
                    // Игнорируем ошибки если контроллер закрыт
                  }
                }, 10000); // Каждые 10 секунд
                
                stream.on('data', (chunk) => {
                  bytesReceived += chunk.length;
                  const canContinue = writeStream.write(chunk);
                  if (!canContinue) {
                    stream.pause();
                    writeStream.once('drain', () => stream.resume());
                  }
                  
                  // Обновляем прогресс каждые 5MB или каждые 5 секунд
                  const now = Date.now();
                  if (now - lastProgressUpdate > 5000 || bytesReceived % (5 * 1024 * 1024) < chunk.length) {
                    const progress = totalSize > 0 ? Math.min(95, Math.round((bytesReceived / totalSize) * 90)) : undefined;
                    const message = `Загрузка файла... ${(bytesReceived / (1024 * 1024)).toFixed(2)}MB из ${uploadFileSizeMB.toFixed(2)}MB`;
                    try {
                      sendProgress(controller, message, progress);
                    } catch (e) {
                      // Игнорируем ошибки
                    }
                    lastProgressUpdate = now;
                  }
                });
                
                stream.on('end', () => {
                  clearInterval(heartbeatInterval);
                  writeStream.end();
                });
                
                stream.on('error', (err) => {
                  clearInterval(heartbeatInterval);
                  writeStream.destroy();
                  reject(err);
                });
              }
            });
            
            bb.on('field', (name, value) => {
              console.log(`[TRANSCRIBE] Field event received: ${name} = ${value}`);
              if (name === 'sectionId') {
                sectionIdValue = value;
              }
            });
            
            bb.on('finish', async () => {
              console.log('[TRANSCRIBE] Busboy finish event received');
              await new Promise<void>((resolve, reject) => {
                writeStream.on('finish', () => resolve());
                writeStream.on('error', reject);
              });

              const uploadedSizeMB = contentLength / (1024 * 1024);
              if (uploadedSizeMB > KEEP_FILE_ON_DISK_OVER_MB) {
                // Не грузим в память — оставляем на диске, обработаем по сегментам
                sectionId = sectionIdValue;
                largeFileFileName = fileName;
                largeFileMimeType = fileType;
                console.log(`[TRANSCRIBE] Large file left on disk: ${tempFile}, ${uploadedSizeMB.toFixed(2)}MB`);
              } else {
                const fileBuffer = await readFile(tempFile);
                file = new File([fileBuffer], fileName, { type: fileType });
                sectionId = sectionIdValue;
                console.log(`[TRANSCRIBE] File saved to disk and read to memory: ${tempFile}, size: ${fileBuffer.length}`);
                try {
                  await unlink(tempFile);
                  tempFilePath = null;
                } catch (e) {
                  console.warn(`[TRANSCRIBE] Failed to delete temp file: ${e}`);
                }
              }
              resolve();
            });
            
            bb.on('error', (err) => {
              console.error('[TRANSCRIBE] Busboy error:', err);
              writeStream.destroy();
              reject(err);
            });
            
            // Пайпим request body в busboy
            console.log('[TRANSCRIBE] Starting to pipe request body to busboy...');
            if (request.body) {
              try {
                // В Next.js request.body - это ReadableStream, преобразуем в Node.js stream
                const reader = (request.body as ReadableStream).getReader();
                console.log('[TRANSCRIBE] Got reader from request.body');
                
                // Читаем поток и пишем в busboy
                const pump = async () => {
                  try {
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) {
                        console.log('[TRANSCRIBE] Request body stream ended');
                        bb.end();
                        break;
                      }
                      if (value) {
                        bb.write(value);
                        if (!fileStarted) {
                          console.log('[TRANSCRIBE] Writing data to busboy, chunk size:', value.length);
                        }
                      }
                    }
                  } catch (readError: any) {
                    console.error('[TRANSCRIBE] Error reading from stream:', readError);
                    reader.releaseLock();
                    reject(readError);
                  }
                };
                
                pump().catch(reject);
              } catch (streamError: any) {
                console.error('[TRANSCRIBE] Error setting up stream:', streamError);
                reject(streamError);
              }
            } else {
              console.error('[TRANSCRIBE] Request body is null');
              reject(new Error('Request body is null'));
            }
          });
        } else {
          // Для маленьких файлов используем стандартный formData (как раньше)
          console.log(`[TRANSCRIBE] Small file (${uploadFileSizeMB.toFixed(2)}MB), using standard FormData...`);
          const formData = await request.formData();
          file = formData.get('file') as File;
          sectionId = formData.get('sectionId') as string;
        }

        if (!file && !tempFilePath) {
          const error = JSON.stringify({ type: 'error', error: 'Файл не загружен' });
          controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
          controller.close();
          return;
        }

        if (!sectionId) {
          const error = JSON.stringify({ type: 'error', error: 'Раздел не выбран' });
          controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
          controller.close();
          return;
        }

        const fileName = file ? file.name : largeFileFileName;

        sendProgress(controller, 'Проверка раздела...', 10);

        // Проверяем, что раздел существует
        const { data: section, error: sectionError } = await supabase
          .from('ai_sections')
          .select('*')
          .eq('id', sectionId)
          .single();

        if (sectionError || !section) {
          const error = JSON.stringify({ type: 'error', error: 'Раздел не найден' });
          controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
          controller.close();
          return;
        }

        sendProgress(controller, 'Проверка размера файла...', 15);

        const fileSizeMB = file
          ? file.size / (1024 * 1024)
          : (await stat(tempFilePath!)).size / (1024 * 1024);

        if (fileSizeMB > MAX_FILE_SIZE_MB) {
          const error = JSON.stringify({
            type: 'error',
            error: `Файл слишком большой (${fileSizeMB.toFixed(2)}MB). Максимальный размер: ${MAX_FILE_SIZE_MB}MB`,
          });
          controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
          controller.close();
          return;
        }

        const fileExtension = fileName.split('.').pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
          mp3: 'audio/mpeg',
          mp4: 'video/mp4',
          mpeg: 'video/mpeg',
          mpga: 'audio/mpeg',
          m4a: 'audio/mp4',
          wav: 'audio/wav',
          webm: 'audio/webm',
        };
        let mimeType = file ? file.type : largeFileMimeType;
        if (!mimeType || mimeType === 'application/octet-stream') {
          mimeType = mimeTypes[fileExtension || ''] || 'audio/mpeg';
        }
        const isVideo = isVideoFile(mimeType, fileName);

        let transcriptText: string;

        if (tempFilePath) {
          // Большой файл на диске: извлекаем аудио (если видео), режем на сегменты ≤25MB, транскрибируем по частям
          let audioPath: string;
          let durationSec: number;
          if (isVideo) {
            sendProgress(controller, 'Извлечение аудио из видео...', 20);
            const audioTempPath = join(tmpdir(), `audio_${Date.now()}.mp3`);
            const result = await extractAudioFromVideoToFile(tempFilePath, audioTempPath);
            audioPath = audioTempPath;
            durationSec = result.durationSec;
            sendProgress(controller, `Аудио извлечено, сегментация...`, 25);
          } else {
            audioPath = tempFilePath;
            durationSec = await getMediaDuration(tempFilePath);
          }
          const numSegments = Math.ceil(durationSec / SEGMENT_DURATION_SEC) || 1;
          const parts: string[] = [];
          for (let i = 0; i < numSegments; i++) {
            const startSec = i * SEGMENT_DURATION_SEC;
            const durSec = Math.min(SEGMENT_DURATION_SEC, durationSec - startSec);
            sendProgress(
              controller,
              `Транскрибация сегмента ${i + 1}/${numSegments}...`,
              30 + Math.floor((i / numSegments) * 20)
            );
            const segmentPath = join(tmpdir(), `seg_${Date.now()}_${i}.mp3`);
            await extractAudioSegment(audioPath, startSec, durSec, segmentPath, false);
            const segBuf = await readFile(segmentPath);
            const text = await transcribeBufferWithWhisper(segBuf, 'audio/mpeg', `seg_${i}.mp3`);
            if (text?.trim()) parts.push(text.trim());
            await unlink(segmentPath).catch(() => {});
          }
          if (isVideo && audioPath) await unlink(audioPath).catch(() => {});
          transcriptText = parts.join(' ');
          if (!transcriptText?.trim()) {
            const error = JSON.stringify({
              type: 'error',
              error: 'Транскрибация вернула пустой результат.',
            });
            controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
            controller.close();
            return;
          }
        } else {
          // Файл в памяти: как раньше, но при >25MB — пишем во временный файл и режем сегментами
          sendProgress(controller, `Подготовка файла (${fileSizeMB.toFixed(2)}MB)...`, 18);
          const arrayBuffer = await file!.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          let finalBuffer: Buffer = buffer;
          let finalMimeType = mimeType;
          let finalFileName = fileName;
          let finalSizeMB = fileSizeMB;

          if (isVideo) {
            sendProgress(controller, 'Извлечение аудио из видео...', 20);
            try {
              const { audioBuffer, audioSizeMB } = await extractAudioFromVideo(buffer, fileName);
              finalBuffer = Buffer.from(audioBuffer);
              finalMimeType = 'audio/mpeg';
              finalFileName = fileName.replace(/\.[^/.]+$/, '.mp3');
              finalSizeMB = audioSizeMB;
              sendProgress(controller, `Аудио извлечено: ${finalSizeMB.toFixed(2)}MB`, 25);
            } catch (extractionError: any) {
              const error = JSON.stringify({
                type: 'error',
                error: 'Ошибка при извлечении аудио из видео',
                details: extractionError.message || String(extractionError),
              });
              controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
              controller.close();
              return;
            }
          }

          if (finalSizeMB > WHISPER_MAX_SIZE_MB) {
            sendProgress(controller, 'Разбиение на сегменты для Whisper...', 28);
            const audioTempPath = join(tmpdir(), `audio_${Date.now()}.mp3`);
            await writeFile(audioTempPath, finalBuffer);
            const durationSec = await getMediaDuration(audioTempPath);
            const numSegments = Math.ceil(durationSec / SEGMENT_DURATION_SEC) || 1;
            const parts: string[] = [];
            for (let i = 0; i < numSegments; i++) {
              const startSec = i * SEGMENT_DURATION_SEC;
              const durSec = Math.min(SEGMENT_DURATION_SEC, durationSec - startSec);
              sendProgress(
                controller,
                `Транскрибация сегмента ${i + 1}/${numSegments}...`,
                30 + Math.floor((i / numSegments) * 20)
              );
              const segmentPath = join(tmpdir(), `seg_${Date.now()}_${i}.mp3`);
              await extractAudioSegment(audioTempPath, startSec, durSec, segmentPath, false);
              const segBuf = await readFile(segmentPath);
              const text = await transcribeBufferWithWhisper(segBuf, 'audio/mpeg', `seg_${i}.mp3`);
              if (text?.trim()) parts.push(text.trim());
              await unlink(segmentPath).catch(() => {});
            }
            await unlink(audioTempPath).catch(() => {});
            transcriptText = parts.join(' ');
          } else {
            sendProgress(controller, 'Транскрибация через Whisper API...', 30);
            let heartbeatCount = 0;
            const heartbeatInterval = setInterval(() => {
              heartbeatCount++;
              sendProgress(controller, `Транскрибация... (${heartbeatCount * 10} сек)`, undefined);
            }, 10000);
            try {
              transcriptText = await transcribeBufferWithWhisper(
                finalBuffer,
                finalMimeType,
                finalFileName
              );
              clearInterval(heartbeatInterval);
            } catch (transcriptionError: any) {
              clearInterval(heartbeatInterval);
              const error = JSON.stringify({
                type: 'error',
                error: transcriptionError.message || 'Ошибка при транскрибации',
                details: transcriptionError.message,
              });
              controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
              controller.close();
              return;
            }
          }

          if (!transcriptText?.trim()) {
            const error = JSON.stringify({
              type: 'error',
              error: 'Транскрибация вернула пустой результат.',
            });
            controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
            controller.close();
            return;
          }
        }

        console.log(`Transcription completed, length: ${transcriptText.length} characters`);

        sendProgress(controller, 'Разбиение текста на чанки и обработка...', 50);

        // Разбиваем текст на чанки по мере обработки
        // Для осмысленных ответов используем 1000 символов с перекрытием 200
        const CHUNK_SIZE = 1000; // 1000 символов в чанке для лучшего контекста
        const OVERLAP = 200; // Перекрытие 200 символов для сохранения контекста
        const EMBEDDING_BATCH_SIZE = 10;
        const MIN_CHUNK_SIZE = 50; // Минимальный размер чанка (чтобы не было слишком маленьких)
        
        let start = 0;
        let chunkIndex = 0;
        let processedCount = 0;
        const totalLength = transcriptText.length;
        
        // Оцениваем примерное количество чанков для прогресса
        const estimatedChunks = Math.ceil(totalLength / (CHUNK_SIZE - OVERLAP));
        console.log(`Text length: ${totalLength} characters, estimated chunks: ~${estimatedChunks}`);

        sendProgress(controller, `Создание эмбеддингов и сохранение (батчами по ${EMBEDDING_BATCH_SIZE})...`, 60);

        // Обрабатываем чанки по мере их создания
        const batchTexts: string[] = [];
        const batchIndices: number[] = [];
        
        while (start < transcriptText.length) {
          const end = Math.min(start + CHUNK_SIZE, transcriptText.length);
          let chunkText = transcriptText.slice(start, end);
          let actualEnd = end;
          
          // Пытаемся разбить по предложениям для лучшего контекста
          // Если не в конце текста и чанк достаточно большой, ищем конец предложения
          if (end < transcriptText.length && chunkText.length >= CHUNK_SIZE * 0.8) {
            // Ищем последний конец предложения (точка, восклицательный или вопросительный знак с пробелом или новой строкой)
            const sentenceEndPatterns = ['. ', '! ', '? ', '.\n', '!\n', '?\n', '.', '!', '?'];
            let lastSentenceEnd = -1;
            
            for (const pattern of sentenceEndPatterns) {
              const pos = chunkText.lastIndexOf(pattern);
              if (pos > lastSentenceEnd && pos > CHUNK_SIZE * 0.7) {
                lastSentenceEnd = pos + pattern.length;
              }
            }
            
            // Если нашли конец предложения, используем его
            if (lastSentenceEnd > CHUNK_SIZE * 0.7) {
              chunkText = chunkText.slice(0, lastSentenceEnd);
              actualEnd = start + lastSentenceEnd;
            }
          }
          
          chunkText = chunkText.trim();
          
          // Пропускаем слишком маленькие чанки
          if (chunkText.length >= MIN_CHUNK_SIZE) {
            batchTexts.push(chunkText);
            batchIndices.push(chunkIndex);
            chunkIndex++;
            
            // Переходим к следующему чанку с учетом перекрытия
            start = actualEnd - OVERLAP;
            if (start < 0) start = 0;
            // Защита от зацикливания - если start не изменился, увеличиваем на 1
            if (start === actualEnd - OVERLAP && actualEnd === end && start >= end - OVERLAP) {
              start = end;
            }
          } else {
            // Слишком маленький или пустой чанк - переходим дальше
            start = actualEnd;
          }
          
          if (start >= transcriptText.length) break;
          
          // Когда накопили батч, обрабатываем его
          if (batchTexts.length >= EMBEDDING_BATCH_SIZE) {
            // Создаем эмбеддинги для батча
            const batchEmbeddings = await createEmbeddings(batchTexts);
            
            // Формируем записи для этого батча
            const batchRecords = batchTexts.map((text, batchIndex) => ({
              section_id: sectionId,
              content: text,
              embedding: batchEmbeddings[batchIndex],
              metadata: {
                chunk_index: batchIndices[batchIndex],
                total_chunks: chunkIndex, // Используем реальное количество чанков
                file_name: fileName,
                created_at: new Date().toISOString(),
              },
              created_at: new Date().toISOString(),
            }));

            // Сохраняем батч в БД
            const { error: insertError } = await supabase
              .from('ai_vectors')
              .insert(batchRecords);

            if (insertError) {
              console.error('Insert error:', insertError);
              const error = JSON.stringify({ 
                type: 'error', 
                error: 'Ошибка при сохранении данных. Убедитесь, что таблица ai_vectors создана в Supabase с расширением pgvector.',
                details: insertError.message,
                hint: 'Выполните SQL скрипт из файла supabase-setup.sql в SQL Editor вашего Supabase проекта'
              });
              controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
              controller.close();
              return;
            }

            processedCount += batchRecords.length;
            const progress = 60 + Math.floor((processedCount / Math.max(estimatedChunks, 1)) * 30);
            sendProgress(controller, `Обработано ${processedCount} чанков...`, progress);

            batchTexts.length = 0;
            batchIndices.length = 0;

            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
        
        // Обрабатываем оставшиеся чанки
        if (batchTexts.length > 0) {
          const batchEmbeddings = await createEmbeddings(batchTexts);
          const batchRecords = batchTexts.map((text, batchIndex) => ({
            section_id: sectionId,
            content: text,
            embedding: batchEmbeddings[batchIndex],
              metadata: {
                chunk_index: batchIndices[batchIndex],
                total_chunks: chunkIndex, // Используем реальное количество чанков
                file_name: fileName,
                created_at: new Date().toISOString(),
              },
            created_at: new Date().toISOString(),
          }));

          const { error: insertError } = await supabase
            .from('ai_vectors')
            .insert(batchRecords);

          if (insertError) {
            console.error('Insert error:', insertError);
            const error = JSON.stringify({ 
              type: 'error', 
              error: 'Ошибка при сохранении данных.',
              details: insertError.message,
            });
            controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
            controller.close();
            return;
          }

          processedCount += batchRecords.length;
        }

        transcriptText = '';
        console.log(`Successfully processed and inserted ${processedCount} chunks into database`);

        sendProgress(controller, 'Обновление статистики раздела...', 95);

        // Обновляем статистику раздела
        const { error: updateError } = await supabase
          .from('ai_sections')
          .update({
            total_chunks: (section.total_chunks || 0) + processedCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sectionId);

        if (updateError) {
          console.error('Update section error:', updateError);
        }

        sendProgress(controller, 'Готово!', 100);

        const success = JSON.stringify({
          type: 'success',
          success: true,
          chunksCount: processedCount,
          message: `Успешно обработано! Создано ${processedCount} чанков с эмбеддингами.`,
        });
        controller.enqueue(new TextEncoder().encode(`data: ${success}\n\n`));
        if (tempFilePath) {
          try {
            await unlink(tempFilePath);
            console.log('[TRANSCRIBE] Temporary upload file deleted after success:', tempFilePath);
          } catch (e) {
            console.warn('[TRANSCRIBE] Failed to delete temp file after success:', e);
          }
        }
        controller.close();
      } catch (error: any) {
        console.error('Transcription error:', error);
        console.error('Error stack:', error.stack);
        
        // Удаляем временный файл при ошибке
        if (tempFilePath) {
          try {
            await unlink(tempFilePath);
            console.log(`[TRANSCRIBE] Temporary file deleted after error: ${tempFilePath}`);
          } catch (unlinkError) {
            console.warn(`[TRANSCRIBE] Failed to delete temp file after error: ${unlinkError}`);
          }
        }
        
        const errorMsg = JSON.stringify({
          type: 'error',
          error: error.message || 'Ошибка при транскрибации',
          details: error.stack || String(error),
        });
        controller.enqueue(new TextEncoder().encode(`data: ${errorMsg}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
