import { writeFile, unlink, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';

// Динамический импорт для избежания проблем с webpack
async function getFFmpeg() {
  const ffmpeg = (await import('fluent-ffmpeg')).default;
  const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg');
  
  // Устанавливаем путь к ffmpeg
  const ffmpegPath = ffmpegInstaller.path;
  if (!existsSync(ffmpegPath)) {
    throw new Error(`FFmpeg not found at path: ${ffmpegPath}`);
  }
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log(`FFmpeg initialized at: ${ffmpegPath}`);
  
  return ffmpeg;
}

/**
 * Извлекает аудио из видео файла и возвращает Buffer
 */
export async function extractAudioFromVideo(
  videoBuffer: Buffer,
  inputFileName: string
): Promise<{ audioBuffer: Buffer; audioSizeMB: number }> {
  const tempDir = tmpdir();
  const timestamp = Date.now();
  const inputPath = join(tempDir, `input_${timestamp}_${inputFileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
  const outputPath = join(tempDir, `output_${timestamp}.mp3`);

  console.log(`Starting audio extraction: ${inputFileName}, size: ${(videoBuffer.length / (1024 * 1024)).toFixed(2)}MB`);

  try {
    // Записываем видео во временный файл
    console.log(`Writing video to temp file: ${inputPath}`);
    await writeFile(inputPath, videoBuffer);
    console.log('Video file written successfully');

    // Получаем ffmpeg с динамическим импортом
    const ffmpeg = await getFFmpeg();

    // Извлекаем аудио в MP3 формат с хорошим качеством
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Audio extraction timeout (5 minutes)'));
      }, 5 * 60 * 1000);

      ffmpeg(inputPath)
        .outputOptions([
          '-vn', // Без видео
          '-acodec', 'libmp3lame', // Кодек MP3
          '-ar', '22050', // Уменьшенная частота дискретизации для меньшего размера
          '-ac', '1', // Моно вместо стерео для меньшего размера
          '-b:a', '128k', // Уменьшенный битрейт для меньшего размера файла
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('FFmpeg command:', commandLine);
        })
        .on('end', () => {
          clearTimeout(timeout);
          console.log('Audio extraction completed');
          resolve();
        })
        .on('error', (err) => {
          clearTimeout(timeout);
          console.error('FFmpeg error:', err);
          console.error('Error message:', err.message);
          reject(new Error(`FFmpeg error: ${err.message}`));
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`Extraction progress: ${Math.round(progress.percent)}%`);
          }
        })
        .run();
    });

    // Проверяем, что файл создан
    if (!existsSync(outputPath)) {
      throw new Error('Output audio file was not created');
    }

    // Читаем извлеченный аудио файл
    console.log(`Reading extracted audio from: ${outputPath}`);
    const audioBuffer = await readFile(outputPath);
    const audioSizeMB = audioBuffer.length / (1024 * 1024);

    if (audioBuffer.length === 0) {
      throw new Error('Extracted audio file is empty');
    }

    console.log(`Audio extracted successfully: ${audioSizeMB.toFixed(2)}MB (from ${(videoBuffer.length / (1024 * 1024)).toFixed(2)}MB video)`);

    return { audioBuffer, audioSizeMB };
  } catch (error: any) {
    console.error('Audio extraction failed:', error);
    throw error;
  } finally {
    // Удаляем временные файлы
    try {
      if (existsSync(inputPath)) {
        await unlink(inputPath);
        console.log('Temp input file deleted');
      }
    } catch (e) {
      console.warn('Failed to delete temp input file:', e);
    }
    try {
      if (existsSync(outputPath)) {
        await unlink(outputPath);
        console.log('Temp output file deleted');
      }
    } catch (e) {
      console.warn('Failed to delete temp output file:', e);
    }
  }
}

/**
 * Проверяет, является ли файл видео
 */
export function isVideoFile(mimeType: string, fileName: string): boolean {
  const videoMimeTypes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
  const videoExtensions = ['mp4', 'mpeg', 'mov', 'avi', 'webm', 'mkv', 'flv'];
  
  if (videoMimeTypes.includes(mimeType)) {
    return true;
  }
  
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension ? videoExtensions.includes(extension) : false;
}
