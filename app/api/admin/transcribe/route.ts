import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { openai } from '@/lib/openai';
import { splitTextIntoChunks, createEmbeddings } from '@/lib/embeddings';
import { extractAudioFromVideo, isVideoFile } from '@/lib/audio-extractor';
import { readFile, unlink } from 'fs/promises';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import busboy from 'busboy';
import { Readable } from 'stream';

// Настройка для больших файлов (до 250MB)
export const maxDuration = 1800; // 30 минут для обработки больших файлов
export const runtime = 'nodejs';

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

function sendProgress(controller: ReadableStreamDefaultController, message: string, progress?: number) {
  const data = JSON.stringify({ type: 'progress', message, progress });
  controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
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
        
        let file: File | null = null;
        let sectionId: string = '';

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
                fileSize: 500 * 1024 * 1024 // 500MB лимит
              }
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
              
              // Читаем файл с диска и создаем File объект
              const fileBuffer = await readFile(tempFile);
              file = new File([fileBuffer], fileName, { type: fileType });
              sectionId = sectionIdValue;
              
              console.log(`[TRANSCRIBE] File saved to disk: ${tempFile}, size: ${fileBuffer.length}`);
              
              // Удаляем временный файл после чтения
              try {
                await unlink(tempFile);
                tempFilePath = null; // Уже удален
                console.log(`[TRANSCRIBE] Temporary file deleted: ${tempFile}`);
              } catch (e) {
                console.warn(`[TRANSCRIBE] Failed to delete temp file: ${e}`);
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

        if (!file) {
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

        // Сохраняем имя файла для использования в дальнейшем
        const fileName = file.name;

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

        // Проверяем размер файла (максимум 250MB)
        const fileSizeMB = file.size / (1024 * 1024);
        const MAX_FILE_SIZE_MB = 250;
        
        if (fileSizeMB > MAX_FILE_SIZE_MB) {
          const error = JSON.stringify({ 
            type: 'error', 
            error: `Файл слишком большой (${fileSizeMB.toFixed(2)}MB). Максимальный размер: ${MAX_FILE_SIZE_MB}MB` 
          });
          controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
          controller.close();
          return;
        }

        sendProgress(controller, `Подготовка файла (${fileSizeMB.toFixed(2)}MB)...`, 18);

        // Конвертируем файл в нужный формат для Whisper API
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const fileExtension = fileName.split('.').pop()?.toLowerCase();
        let mimeType = file.type;
        
        // Если MIME тип не определен, определяем по расширению
        if (!mimeType || mimeType === 'application/octet-stream') {
          const mimeTypes: Record<string, string> = {
            'mp3': 'audio/mpeg',
            'mp4': 'video/mp4',
            'mpeg': 'video/mpeg',
            'mpga': 'audio/mpeg',
            'm4a': 'audio/mp4',
            'wav': 'audio/wav',
            'webm': 'audio/webm',
          };
          mimeType = mimeTypes[fileExtension || ''] || 'audio/mpeg';
        }

        // Проверяем, является ли файл видео
        const isVideo = isVideoFile(mimeType, fileName);
        let finalBuffer: Buffer = buffer;
        let finalMimeType = mimeType;
        let finalFileName = fileName;
        let finalSizeMB = fileSizeMB;

        // Если это видео файл, извлекаем аудио
        if (isVideo) {
          sendProgress(controller, 'Извлечение аудио из видео...', 20);
          console.log(`Extracting audio from video file: ${fileName}, size: ${fileSizeMB.toFixed(2)}MB`);
          
          try {
            sendProgress(controller, 'Обработка видео файла...', 22);
            const { audioBuffer, audioSizeMB } = await extractAudioFromVideo(buffer, fileName);
            finalBuffer = Buffer.from(audioBuffer);
            finalMimeType = 'audio/mpeg';
            finalFileName = fileName.replace(/\.[^/.]+$/, '.mp3');
            finalSizeMB = audioSizeMB;
            
            console.log(`Audio extracted successfully: ${finalSizeMB.toFixed(2)}MB (from ${fileSizeMB.toFixed(2)}MB video)`);
            sendProgress(controller, `Аудио извлечено: ${finalSizeMB.toFixed(2)}MB`, 25);
          } catch (extractionError: any) {
            console.error('Audio extraction error:', extractionError);
            console.error('Extraction error stack:', extractionError.stack);
            const error = JSON.stringify({ 
              type: 'error', 
              error: 'Ошибка при извлечении аудио из видео',
              details: extractionError.message || String(extractionError),
              suggestion: 'Убедитесь, что ffmpeg установлен и файл является валидным видео файлом. Проверьте логи сервера для деталей.'
            });
            controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
            controller.close();
            return;
          }
        }

        sendProgress(controller, 'Транскрибация через Whisper API...', 30);

        // Создаем File для OpenAI API
        // Преобразуем Buffer в Uint8Array для совместимости с File/Blob конструкторами
        const bufferArray = new Uint8Array(finalBuffer);
        let whisperFile: File | Blob;
        
        try {
          whisperFile = new File([bufferArray], finalFileName, { type: finalMimeType });
          console.log('Using File for transcription');
        } catch (e) {
          // Если File не доступен, используем Blob
          whisperFile = new Blob([bufferArray], { type: finalMimeType });
          console.log('Fallback to Blob');
        }

        console.log(`Transcribing file: ${finalFileName}, size: ${finalSizeMB.toFixed(2)}MB, type: ${finalMimeType}`);

        // Проверяем размер файла для Whisper API (лимит 25MB)
        // Используем finalSizeMB после извлечения аудио (если это было видео)
        const WHISPER_MAX_SIZE_MB = 25;
        let transcriptText: string;

        // Если файл (после извлечения аудио) все еще больше лимита, возвращаем ошибку
        if (finalSizeMB > WHISPER_MAX_SIZE_MB) {
          const error = JSON.stringify({ 
            type: 'error', 
            error: `Аудио файл слишком большой (${finalSizeMB.toFixed(2)}MB). Whisper API поддерживает максимум ${WHISPER_MAX_SIZE_MB}MB.`,
            suggestion: 'Попробуйте разбить файл на части по 25MB каждая или использовать файл меньшего размера.',
            fileSize: `${finalSizeMB.toFixed(2)}MB`,
            originalSize: isVideo ? `${fileSizeMB.toFixed(2)}MB` : undefined,
            fileType: finalMimeType,
            fileExtension: fileExtension,
            maxSize: `${WHISPER_MAX_SIZE_MB}MB`
          });
          controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
          controller.close();
          return;
        }

        // Отправляем heartbeat чтобы клиент знал, что процесс идет
        let heartbeatCount = 0;
        const heartbeatInterval = setInterval(() => {
          heartbeatCount++;
          sendProgress(controller, `Транскрибация в процессе... (${heartbeatCount * 10} сек)`, undefined);
          console.log(`Heartbeat ${heartbeatCount}: Transcription still in progress...`);
        }, 10000); // Каждые 10 секунд

        try {
          console.log('Sending file to Whisper API...');
          sendProgress(controller, 'Отправка файла в Whisper API...', 30);

          // Транскрибируем через Whisper с retry логикой для обработки ошибок соединения
          let transcription: any;
          let retryCount = 0;
          const maxRetries = 3;
          
          while (retryCount < maxRetries) {
            try {
              if (retryCount > 0) {
                sendProgress(controller, `Повторная попытка отправки (${retryCount + 1}/${maxRetries})...`, 30);
                console.log(`Retry ${retryCount + 1}/${maxRetries} after connection error...`);
                // Ждем перед повтором (экспоненциальная задержка)
                await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, retryCount - 1)));
              }
              
              transcription = await openai.audio.transcriptions.create({
                file: whisperFile as any,
                model: 'whisper-1',
                language: 'ru',
                response_format: 'text',
              });
              
              // Успешно получили ответ
              break;
            } catch (retryError: any) {
              retryCount++;
              
              // Проверяем, является ли это ошибкой соединения
              const isConnectionError = 
                retryError.code === 'EPIPE' || 
                retryError.message?.includes('Connection error') || 
                retryError.message?.includes('fetch failed') ||
                retryError.cause?.code === 'EPIPE';
              
              if (isConnectionError && retryCount < maxRetries) {
                console.log(`Connection error on attempt ${retryCount}, retrying...`);
                continue;
              }
              
              // Если это не ошибка соединения или закончились попытки, пробрасываем ошибку
              throw retryError;
            }
          }

          clearInterval(heartbeatInterval);
          console.log('Whisper API response received');

          // Whisper возвращает строку напрямую при response_format: 'text'
          if (typeof transcription === 'string') {
            transcriptText = transcription;
          } else if (transcription?.text) {
            transcriptText = transcription.text;
          } else {
            transcriptText = String(transcription);
          }

          if (!transcriptText || transcriptText.trim().length === 0) {
            const error = JSON.stringify({ 
              type: 'error', 
              error: 'Транскрибация вернула пустой результат. Возможно, файл не содержит аудио или формат не поддерживается.' 
            });
            controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
            controller.close();
            return;
          }

          console.log(`Transcription completed, length: ${transcriptText.length} characters`);

        } catch (transcriptionError: any) {
          clearInterval(heartbeatInterval);
          console.error('Whisper API error:', transcriptionError);
          console.error('Error details:', {
            status: transcriptionError.status,
            statusCode: transcriptionError.statusCode,
            statusText: transcriptionError.statusText,
            message: transcriptionError.message,
            error: transcriptionError.error,
            response: transcriptionError.response,
            code: transcriptionError.code,
            name: transcriptionError.name,
          });

          // Пытаемся извлечь детальную информацию об ошибке
          let errorDetails = transcriptionError.message || String(transcriptionError);
          let errorStatus = transcriptionError.status || transcriptionError.statusCode;
          
          if (transcriptionError.response) {
            try {
              const responseData = typeof transcriptionError.response === 'string' 
                ? JSON.parse(transcriptionError.response)
                : transcriptionError.response;
              if (responseData.error) {
                errorDetails = responseData.error.message || errorDetails;
              }
            } catch (e) {
              // Игнорируем ошибки парсинга
            }
          }

          if (transcriptionError.error) {
            if (typeof transcriptionError.error === 'string') {
              errorDetails = transcriptionError.error;
            } else if (transcriptionError.error.message) {
              errorDetails = transcriptionError.error.message;
            }
          }
          
          let errorMessage = 'Ошибка при транскрибации';
          let suggestion = '';

          // Проверяем размер файла - если больше 25MB, вероятно проблема в размере
          if (finalSizeMB > 25) {
            errorMessage = `Аудио файл слишком большой (${finalSizeMB.toFixed(2)}MB). Whisper API поддерживает максимум 25MB.`;
            suggestion = isVideo 
              ? `Аудио извлечено из видео (${fileSizeMB.toFixed(2)}MB → ${finalSizeMB.toFixed(2)}MB), но все еще слишком большое. Попробуйте разбить файл на части.`
              : 'Попробуйте сжать файл или разбить его на части.';
          } else if (errorStatus === 413 || transcriptionError.statusCode === 413) {
            errorMessage = `Файл слишком большой (${finalSizeMB.toFixed(2)}MB). Whisper API поддерживает максимум 25MB.`;
            suggestion = 'Попробуйте сжать файл или разбить его на части.';
          } else if (errorStatus === 400 || transcriptionError.statusCode === 400) {
            // Для больших файлов API может вернуть 400 вместо 413
            if (finalSizeMB > 25) {
              errorMessage = `Аудио файл слишком большой (${finalSizeMB.toFixed(2)}MB). Whisper API поддерживает максимум 25MB.`;
              suggestion = 'Попробуйте разбить файл на части.';
            } else {
              errorMessage = `Неверный формат файла или ошибка обработки. Поддерживаются: mp3, mp4, mpeg, mpga, m4a, wav, webm. Детали: ${errorDetails}`;
            }
          } else if (transcriptionError.message) {
            errorMessage = transcriptionError.message;
          } else if (transcriptionError.error?.message) {
            errorMessage = transcriptionError.error.message;
          }

          // Проверяем, не таймаут ли это
          if (transcriptionError.code === 'ECONNABORTED' || transcriptionError.message?.includes('timeout')) {
            errorMessage = 'Таймаут при транскрибации. Файл слишком большой или сервер не отвечает.';
            suggestion = 'Попробуйте файл меньшего размера или разбейте его на части.';
          }

          const error = JSON.stringify({ 
            type: 'error', 
            error: errorMessage,
            suggestion: suggestion,
            details: errorDetails,
            fileSize: `${finalSizeMB.toFixed(2)}MB`,
            originalSize: isVideo ? `${fileSizeMB.toFixed(2)}MB` : undefined,
            fileType: finalMimeType,
            fileExtension: fileExtension,
            statusCode: errorStatus
          });
          controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
          controller.close();
          return;
        }

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
            
            // Очищаем батчи
            batchTexts.length = 0;
            batchIndices.length = 0;
            batchEmbeddings.length = 0;
            batchRecords.length = 0;
            
            // Задержка для сборки мусора
            await new Promise(resolve => setTimeout(resolve, 100));
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

        // Очищаем transcriptText из памяти
        transcriptText = '';
        
        console.log(`Successfully processed and inserted ${processedCount} chunks into database`);
        
        // Обрабатываем оставшиеся чанки
        if (batchTexts.length > 0) {
          const batchEmbeddings = await createEmbeddings(batchTexts);
          const batchRecords = batchTexts.map((text, batchIndex) => ({
            section_id: sectionId,
            content: text,
            embedding: batchEmbeddings[batchIndex],
            metadata: {
              chunk_index: batchIndices[batchIndex],
              total_chunks: chunkIndex,
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

        // Очищаем transcriptText из памяти
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
