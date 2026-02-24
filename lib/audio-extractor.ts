import { writeFile, unlink, readFile, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';

// Динамический импорт для избежания проблем с webpack
async function getFFmpeg() {
  const ffmpeg = (await import('fluent-ffmpeg')).default;
  
  // Сначала пытаемся использовать системный FFmpeg (более надежно на сервере)
  const systemFfmpegPaths = [
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg', // для macOS
  ];
  
  let ffmpegPath: string | null = null;
  
  // Проверяем системные пути
  for (const path of systemFfmpegPaths) {
    if (existsSync(path)) {
      ffmpegPath = path;
      console.log(`Found system FFmpeg at: ${path}`);
      break;
    }
  }
  
  // Если системный FFmpeg не найден, используем @ffmpeg-installer
  if (!ffmpegPath) {
    try {
      const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg');
      ffmpegPath = ffmpegInstaller.path;
      if (!existsSync(ffmpegPath)) {
        throw new Error(`FFmpeg from @ffmpeg-installer not found at path: ${ffmpegPath}`);
      }
      console.log(`Using FFmpeg from @ffmpeg-installer at: ${ffmpegPath}`);
    } catch (error: any) {
      throw new Error(
        `FFmpeg not found. Please install FFmpeg system-wide: sudo apt install -y ffmpeg libmp3lame-dev. ` +
        `Original error: ${error.message}`
      );
    }
  }
  
  ffmpeg.setFfmpegPath(ffmpegPath);
  const ffprobePath = join(dirname(ffmpegPath), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  if (existsSync(ffprobePath)) {
    ffmpeg.setFfprobePath(ffprobePath);
  }
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

/** Длительность медиа в секундах (для сегментации под Whisper ≤25MB) */
export async function getMediaDuration(filePath: string): Promise<number> {
  const ffmpeg = await getFFmpeg();
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err: Error | null, data: { format?: { duration?: number } }) => {
      if (err) return reject(err);
      const duration = data?.format?.duration;
      if (duration == null || duration <= 0) return reject(new Error('Could not get media duration'));
      resolve(duration);
    });
  });
}

/**
 * Извлекает сегмент аудио в MP3 (для отправки в Whisper).
 * sourcePath — путь к видео или аудио файлу на диске.
 */
export async function extractAudioSegment(
  sourcePath: string,
  startTimeSec: number,
  durationSec: number,
  outputPath: string,
  isVideo: boolean
): Promise<void> {
  const ffmpeg = await getFFmpeg();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Segment extraction timeout (3 min)')), 3 * 60 * 1000);
    const cmd = ffmpeg(sourcePath)
      .setStartTime(startTimeSec)
      .setDuration(durationSec)
      .outputOptions([
        ...(isVideo ? ['-vn'] : []),
        '-acodec', 'libmp3lame',
        '-ar', '22050',
        '-ac', '1',
        '-b:a', '128k',
      ])
      .output(outputPath)
      .on('end', () => { clearTimeout(timeout); resolve(); })
      .on('error', (err: Error) => { clearTimeout(timeout); reject(err); });
    cmd.run();
  });
}

/**
 * Извлекает всё аудио из видео в файл на диске (без загрузки в память).
 * Возвращает длительность в секундах.
 */
export async function extractAudioFromVideoToFile(
  videoPath: string,
  outputAudioPath: string
): Promise<{ durationSec: number }> {
  const ffmpeg = await getFFmpeg();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Audio extraction timeout (15 minutes)')), 15 * 60 * 1000);
    ffmpeg(videoPath)
      .outputOptions([
        '-vn',
        '-acodec', 'libmp3lame',
        '-ar', '22050',
        '-ac', '1',
        '-b:a', '128k',
      ])
      .output(outputAudioPath)
      .on('end', () => { clearTimeout(timeout); resolve(); })
      .on('error', (err: Error) => { clearTimeout(timeout); reject(err); })
      .run();
  });
  if (!existsSync(outputAudioPath)) throw new Error('Extracted audio file was not created');
  const durationSec = await getMediaDuration(outputAudioPath);
  return { durationSec };
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
