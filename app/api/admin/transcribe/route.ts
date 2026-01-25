import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { openai } from '@/lib/openai';
import { splitTextIntoChunks, createEmbeddings } from '@/lib/embeddings';
import { extractAudioFromVideo, isVideoFile } from '@/lib/audio-extractor';
import { parseFormData } from '@mjackson/form-data-parser';
import { readFile, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Настройка для больших файлов (до 250MB)
export const maxDuration = 1800; // 30 минут для обработки больших файлов
export const runtime = 'nodejs';

// Отключаем body parsing по умолчанию для больших файлов
export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  return adminAuth?.value === 'true';
}

function sendProgress(controller: ReadableStreamDefaultController, message: string, progress?: number) {
  try {
    const data = JSON.stringify({ type: 'progress', message, progress });
    controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
  } catch (error: any) {
    // Игнорируем ошибки если контроллер уже закрыт
    if (error.code !== 'ERR_INVALID_STATE') {
      console.error('[TRANSCRIBE] Error sending progress:', error);
    }
  }
}

export async function POST(request: NextRequest) {
  // Логируем ДО всего остального
  console.log('='.repeat(80));
  console.log('[TRANSCRIBE] ===== POST HANDLER CALLED =====');
  console.log('[TRANSCRIBE] Timestamp:', new Date().toISOString());
  console.log('[TRANSCRIBE] Request URL:', request.url);
  console.log('[TRANSCRIBE] Request method:', request.method);
  console.log('[TRANSCRIBE] Content-Type:', request.headers.get('content-type'));
  console.log('[TRANSCRIBE] Content-Length:', request.headers.get('content-length'));
  console.log('[TRANSCRIBE] All headers:', JSON.stringify(Object.fromEntries(request.headers.entries()), null, 2));
  console.log('='.repeat(80));

  if (!(await checkAdminAuth())) {
    console.log('[TRANSCRIBE] Auth check failed');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log('[TRANSCRIBE] Auth check passed');

  const stream = new ReadableStream({
    async start(controller) {
      try {
        console.log('[TRANSCRIBE] Starting transcription process...');
        console.log('[TRANSCRIBE] Stream controller started');
        sendProgress(controller, 'Загрузка файла...', 5);

        // Проверяем что request body доступен
        if (!request.body) {
          console.error('[TRANSCRIBE] Request body is null or undefined');
          const error = JSON.stringify({ 
            type: 'error', 
            error: 'Тело запроса недоступно',
            details: 'Request body is null'
          });
          controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
          controller.close();
          return;
        }

        console.log('[TRANSCRIBE] Reading FormData...');
        console.log('[TRANSCRIBE] Content-Type:', request.headers.get('content-type'));
        console.log('[TRANSCRIBE] Content-Length:', request.headers.get('content-length'));
        
        const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
        const uploadFileSizeMB = contentLength / (1024 * 1024);
        console.log('[TRANSCRIBE] Upload file size:', uploadFileSizeMB.toFixed(2), 'MB');
        
        // Для больших файлов (>50MB) используем потоковое чтение через @mjackson/form-data-parser
        // Это позволяет сохранять файл на диск без загрузки всего в память
        let file: File | null = null;
        let sectionId: string = '';
        let tempFilePath: string | null = null;
        
        if (uploadFileSizeMB > 50) {
          console.log('[TRANSCRIBE] Large file detected, using streaming parser...');
          sendProgress(controller, 'Потоковая загрузка большого файла...', 6);
          
          try {
            const tempDir = tmpdir();
            const tempFile = join(tempDir, `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`);
            tempFilePath = tempFile;
            
            let sectionIdValue = '';
            let fileName = '';
            let fileType = '';
            
            // Используем потоковый парсер для больших файлов
            const formData = await parseFormData(request, async (fileUpload) => {
              if (fileUpload.fieldName === 'file') {
                // FileUpload расширяет File, поэтому используем свойства File API
                fileName = fileUpload.name || 'upload';
                fileType = fileUpload.type || 'application/octet-stream';
                console.log('[TRANSCRIBE] Streaming file to disk:', fileName, 'type:', fileType, 'size:', fileUpload.size);
                
                try {
                  // fileUpload.bytes - это функция, которая возвращает Promise<Uint8Array>
                  // Библиотека обрабатывает файл потоково внутри себя, но bytes() возвращает весь файл
                  // Для больших файлов это все еще может быть проблемой, но лучше чем request.formData()
                  const bytes = await fileUpload.bytes();
                  
                  // Записываем на диск
                  await writeFile(tempFile, bytes);
                  
                  console.log('[TRANSCRIBE] File saved to disk:', tempFile, 'size:', bytes.length);
                  
                  // Создаем File объект из сохраненного файла
                  const fileBuffer = await readFile(tempFile);
                  file = new File([fileBuffer], fileName, {
                    type: fileType
                  });
                } catch (writeError) {
                  throw writeError;
                }
              } else if (fileUpload.fieldName === 'sectionId') {
                // Читаем sectionId из текстового поля
                const textDecoder = new TextDecoder();
                const bytes = await fileUpload.bytes();
                sectionIdValue = textDecoder.decode(bytes).trim();
                console.log('[TRANSCRIBE] SectionId from stream:', sectionIdValue);
              }
            });
            
            sectionId = sectionIdValue || (formData.get('sectionId') as string) || '';
            
            if (!file) {
              throw new Error('File not found in FormData');
            }
            
            if (!sectionId) {
              throw new Error('SectionId not found in FormData');
            }
            
            console.log('[TRANSCRIBE] Streaming parser completed successfully');
          } catch (streamError: any) {
            console.error('[TRANSCRIBE] Error with streaming parser:', streamError);
            // Удаляем временный файл при ошибке
            if (tempFilePath) {
              try {
                await unlink(tempFilePath);
              } catch (e) {
                // Игнорируем ошибки удаления
              }
            }
            throw streamError;
          }
        } else {
          // Для маленьких файлов используем обычный formData
          console.log('[TRANSCRIBE] Small file, using standard FormData...');
          sendProgress(controller, 'Чтение файла с сервера...', 6);
          
          try {
            const formData = await request.formData();
            file = formData.get('file') as File;
            sectionId = formData.get('sectionId') as string;
            console.log('[TRANSCRIBE] FormData read successfully');
          } catch (formDataError: any) {
            console.error('[TRANSCRIBE] Error reading FormData:', formDataError);
            const error = JSON.stringify({ 
              type: 'error', 
              error: 'Ошибка при загрузке файла',
              details: formDataError.message || String(formDataError),
              code: formDataError.code
            });
            controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
            controller.close();
            return;
          }
        }
        
        console.log('[TRANSCRIBE] File received:', file ? {
          name: file.name,
          size: file.size,
          type: file.type
        } : 'null');

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
        console.log('[TRANSCRIBE] Converting file to buffer...');
        console.log('[TRANSCRIBE] File details:', {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified
        });
        
        let arrayBuffer: ArrayBuffer;
        try {
          // Для больших файлов используем stream чтение
          sendProgress(controller, 'Чтение файла...', 19);
          console.log('[TRANSCRIBE] Starting to read file arrayBuffer...');
          
          // Добавляем таймаут для чтения файла (5 минут)
          const readTimeout = setTimeout(() => {
            console.error('[TRANSCRIBE] Timeout reading file after 5 minutes');
          }, 5 * 60 * 1000);
          
          arrayBuffer = await file.arrayBuffer();
          clearTimeout(readTimeout);
          
          console.log('[TRANSCRIBE] File converted to ArrayBuffer, size:', arrayBuffer.byteLength, 'bytes');
          console.log('[TRANSCRIBE] ArrayBuffer size in MB:', (arrayBuffer.byteLength / (1024 * 1024)).toFixed(2));
        } catch (bufferError: any) {
          console.error('[TRANSCRIBE] Error converting file to buffer:', bufferError);
          console.error('[TRANSCRIBE] Error code:', bufferError.code);
          console.error('[TRANSCRIBE] Error message:', bufferError.message);
          console.error('[TRANSCRIBE] Error stack:', bufferError.stack);
          
          const error = JSON.stringify({ 
            type: 'error', 
            error: 'Ошибка при чтении файла',
            details: bufferError.message || String(bufferError),
            code: bufferError.code
          });
          controller.enqueue(new TextEncoder().encode(`data: ${error}\n\n`));
          controller.close();
          return;
        }
        
        console.log('[TRANSCRIBE] Creating Buffer from ArrayBuffer...');
        const buffer = Buffer.from(arrayBuffer);
        console.log('[TRANSCRIBE] Buffer created, size:', buffer.length, 'bytes');
        
        // Очищаем arrayBuffer из памяти
        // @ts-ignore
        arrayBuffer = null;

        const fileExtension = file.name.split('.').pop()?.toLowerCase();
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
        const isVideo = isVideoFile(mimeType, file.name);
        let finalBuffer: Buffer = buffer;
        let finalMimeType = mimeType;
        let finalFileName = file.name;
        let finalSizeMB = fileSizeMB;

        // Если это видео файл, извлекаем аудио
        if (isVideo) {
          sendProgress(controller, 'Извлечение аудио из видео...', 20);
          console.log(`[TRANSCRIBE] Extracting audio from video file: ${file.name}, size: ${fileSizeMB.toFixed(2)}MB`);
          
          try {
            sendProgress(controller, 'Обработка видео файла...', 22);
            console.log('[TRANSCRIBE] Starting audio extraction with FFmpeg...');
            const { audioBuffer, audioSizeMB } = await extractAudioFromVideo(buffer, file.name);
            console.log('[TRANSCRIBE] Audio extraction completed successfully');
            finalBuffer = Buffer.from(audioBuffer);
            finalMimeType = 'audio/mpeg';
            finalFileName = file.name.replace(/\.[^/.]+$/, '.mp3');
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
            const newStart = actualEnd - OVERLAP;
            start = newStart < 0 ? 0 : newStart;
            
            // Защита от зацикливания - если start не изменился или стал меньше, увеличиваем
            if (start >= actualEnd - OVERLAP && start < actualEnd) {
              start = actualEnd;
            }
            // Дополнительная защита - если start не продвинулся, принудительно увеличиваем
            if (start <= end - OVERLAP && start < transcriptText.length) {
              const prevStart = start;
              start = Math.max(start + 1, end - OVERLAP);
              if (start === prevStart) {
                start = end; // Принудительно переходим к концу текущего чанка
              }
            }
          } else {
            // Слишком маленький или пустой чанк - переходим дальше
            start = actualEnd;
            // Защита от зацикливания для маленьких чанков
            if (start >= transcriptText.length) break;
            // Если start не изменился, увеличиваем
            if (start === actualEnd && actualEnd < transcriptText.length) {
              start = actualEnd + 1;
            }
          }
          
          // Финальная проверка от зацикливания
          if (start >= transcriptText.length) break;
          // Если start не продвинулся после всех проверок, принудительно увеличиваем
          const currentStart = start;
          if (currentStart === end || currentStart === actualEnd) {
            start = Math.min(currentStart + 1, transcriptText.length);
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
                file_name: file.name,
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
                file_name: file.name,
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
              file_name: file.name,
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

        // Удаляем временный файл если был создан
        if (tempFilePath) {
          try {
            await unlink(tempFilePath);
            console.log('[TRANSCRIBE] Temporary file deleted:', tempFilePath);
          } catch (unlinkError) {
            console.warn('[TRANSCRIBE] Failed to delete temp file:', unlinkError);
          }
        }

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
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${success}\n\n`));
          controller.close();
        } catch (error: any) {
          // Если контроллер уже закрыт, просто логируем
          if (error.code === 'ERR_INVALID_STATE') {
            console.log('[TRANSCRIBE] Controller already closed, skipping final message');
          } else {
            console.error('[TRANSCRIBE] Error sending final message:', error);
            throw error;
          }
        }
      } catch (error: any) {
        console.error('[TRANSCRIBE] Transcription error:', error);
        console.error('[TRANSCRIBE] Error code:', error.code);
        console.error('[TRANSCRIBE] Error message:', error.message);
        console.error('[TRANSCRIBE] Error stack:', error.stack);
        
        // Удаляем временный файл если был создан (даже при ошибке)
        if (tempFilePath) {
          try {
            await unlink(tempFilePath);
            console.log('[TRANSCRIBE] Temporary file deleted after error:', tempFilePath);
          } catch (unlinkError) {
            console.warn('[TRANSCRIBE] Failed to delete temp file after error:', unlinkError);
          }
        }
        
        // Проверяем, не разорвано ли соединение
        if (error.code === 'ECONNRESET' || error.message?.includes('aborted')) {
          console.error('[TRANSCRIBE] Connection was aborted/reset. This usually means:');
          console.error('[TRANSCRIBE] 1. Client disconnected (browser timeout)');
          console.error('[TRANSCRIBE] 2. Nginx timeout');
          console.error('[TRANSCRIBE] 3. Network issue');
        }
        const errorMsg = JSON.stringify({
          type: 'error',
          error: error.message || 'Ошибка при транскрибации',
          details: error.stack || String(error),
        });
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${errorMsg}\n\n`));
          controller.close();
        } catch (closeError: any) {
          // Если контроллер уже закрыт, просто логируем
          if (closeError.code === 'ERR_INVALID_STATE') {
            console.log('[TRANSCRIBE] Controller already closed, skipping error message');
          } else {
            console.error('[TRANSCRIBE] Error sending error message:', closeError);
          }
        }
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
