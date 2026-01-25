# Установка FFmpeg на сервере для транскрибации видео

## Проблема

Приложение использует `@ffmpeg-installer/ffmpeg` для извлечения аудио из видео, но на сервере могут отсутствовать системные зависимости FFmpeg или необходимые кодеки.

## Решение: Установка FFmpeg системно

### Шаг 1: Обновите список пакетов

```bash
sudo apt update
```

### Шаг 2: Установите FFmpeg с необходимыми кодеками

```bash
# Установка FFmpeg с поддержкой всех необходимых форматов
sudo apt install -y ffmpeg

# Проверьте установку
ffmpeg -version
```

### Шаг 3: Установите дополнительные кодеки (если нужно)

```bash
# Установка дополнительных кодеков для MP3, AAC и других форматов
# Примечание: libavresample-dev устарел в новых версиях Ubuntu, используйте libswresample-dev
sudo apt install -y libmp3lame-dev libavcodec-extra libavformat-dev libavutil-dev libswscale-dev libswresample-dev
```

### Шаг 4: Проверьте что FFmpeg работает

```bash
# Проверка версии
ffmpeg -version

# Проверка поддержки MP3 кодеков
ffmpeg -codecs | grep mp3

# Должно показать что-то вроде:
# DEA.L. mp3                  MP3 (MPEG audio layer 3) (decoders: mp3 mp3float ) (encoders: libmp3lame )
```

### Шаг 5: Проверьте путь к FFmpeg

```bash
# Найдите где установлен FFmpeg
which ffmpeg

# Обычно это: /usr/bin/ffmpeg
```

### Шаг 6: Перезапустите приложение

```bash
# Перезапустите PM2 приложение
sudo -u nodejs pm2 restart yana_app

# Проверьте логи
sudo -u nodejs pm2 logs yana_app --lines 50
```

---

## Альтернатива: Использование системного FFmpeg вместо @ffmpeg-installer

Если `@ffmpeg-installer/ffmpeg` не работает, можно изменить код для использования системного FFmpeg.

### Вариант 1: Установить системный FFmpeg и использовать его путь

Измените `lib/audio-extractor.ts`:

```typescript
async function getFFmpeg() {
  const ffmpeg = (await import('fluent-ffmpeg')).default;
  
  // Используем системный FFmpeg
  const systemFfmpegPath = '/usr/bin/ffmpeg';
  const { existsSync } = await import('fs');
  
  if (existsSync(systemFfmpegPath)) {
    ffmpeg.setFfmpegPath(systemFfmpegPath);
    console.log(`Using system FFmpeg at: ${systemFfmpegPath}`);
  } else {
    // Fallback на @ffmpeg-installer
    const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg');
    const ffmpegPath = ffmpegInstaller.path;
    if (!existsSync(ffmpegPath)) {
      throw new Error(`FFmpeg not found at path: ${ffmpegPath}`);
    }
    ffmpeg.setFfmpegPath(ffmpegPath);
    console.log(`Using installed FFmpeg at: ${ffmpegPath}`);
  }
  
  return ffmpeg;
}
```

---

## Проверка работы

### 1. Проверьте логи приложения

```bash
sudo -u nodejs pm2 logs yana_app --lines 100 | grep -i ffmpeg
```

Должно показать что-то вроде:
```
FFmpeg initialized at: /usr/bin/ffmpeg
```

### 2. Попробуйте загрузить видео файл

Загрузите тестовое видео через админ-панель и проверьте логи:

```bash
sudo -u nodejs pm2 logs yana_app --lines 200
```

### 3. Проверьте ошибки

Если есть ошибки, они будут в логах. Типичные проблемы:

- **"FFmpeg not found"** - FFmpeg не установлен или не в PATH
- **"codec not found"** - отсутствует кодек (установите `libmp3lame-dev`)
- **"Permission denied"** - проблемы с правами доступа

---

## Устранение проблем

### Проблема: "FFmpeg not found"

```bash
# Проверьте что FFmpeg установлен
which ffmpeg

# Если не установлен, установите:
sudo apt install -y ffmpeg
```

### Проблема: "codec libmp3lame not found"

```bash
# Установите MP3 кодек
sudo apt install -y libmp3lame-dev

# Перезапустите приложение
sudo -u nodejs pm2 restart yana_app
```

### Проблема: "Permission denied"

```bash
# Убедитесь что пользователь nodejs имеет доступ к FFmpeg
ls -la /usr/bin/ffmpeg

# Если нужно, измените права
sudo chmod 755 /usr/bin/ffmpeg
```

### Проблема: FFmpeg работает, но не может обработать файл

```bash
# Проверьте что FFmpeg поддерживает нужные форматы
ffmpeg -formats | grep -i mp4
ffmpeg -codecs | grep -i mp3

# Установите дополнительные кодеки
sudo apt install -y ubuntu-restricted-extras
```

---

## Быстрая установка (все команды сразу)

```bash
# Обновить пакеты
sudo apt update

# Установить FFmpeg и кодеки
sudo apt install -y ffmpeg libmp3lame-dev libavcodec-extra libavformat-dev libavutil-dev libswscale-dev libswresample-dev

# Проверить установку
ffmpeg -version

# Перезапустить приложение
sudo -u nodejs pm2 restart yana_app

# Проверить логи
sudo -u nodejs pm2 logs yana_app --lines 50
```

---

## Проверка что все работает

После установки выполните:

```bash
# 1. Проверьте FFmpeg
ffmpeg -version

# 2. Проверьте MP3 кодек
ffmpeg -codecs | grep mp3

# 3. Проверьте логи приложения
sudo -u nodejs pm2 logs yana_app | grep -i ffmpeg

# 4. Попробуйте загрузить видео через админ-панель
```

Если все работает, вы увидите в логах успешное извлечение аудио из видео.
