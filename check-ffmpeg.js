// Скрипт для проверки установки FFmpeg
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fs = require('fs');
const { execSync } = require('child_process');

console.log('=== Проверка FFmpeg ===\n');

// Проверка пути
const ffmpegPath = ffmpegInstaller.path;
console.log('Путь к FFmpeg:', ffmpegPath);

// Проверка существования файла
const exists = fs.existsSync(ffmpegPath);
console.log('Файл существует:', exists ? '✅' : '❌');

if (exists) {
  // Проверка версии
  try {
    const version = execSync(`"${ffmpegPath}" -version`, { 
      encoding: 'utf8', 
      timeout: 5000 
    });
    const firstLine = version.split('\n')[0];
    console.log('Версия:', firstLine);
    console.log('\n✅ FFmpeg установлен и работает!');
  } catch (error) {
    console.error('❌ Ошибка при запуске FFmpeg:', error.message);
  }
} else {
  console.error('❌ FFmpeg не найден по указанному пути');
}
