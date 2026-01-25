# Настройка потоковой загрузки больших файлов

## Что сделано

Добавлена библиотека `@mjackson/form-data-parser` для потокового чтения больших файлов без загрузки всего в память.

### Для файлов >50MB:
- Используется потоковый парсер `@mjackson/form-data-parser`
- Файл сохраняется на диск потоково (не загружается в память целиком)
- После сохранения файл читается с диска и обрабатывается как обычно

### Для файлов <=50MB:
- Используется стандартный `request.formData()` (как раньше)

## Установка

На сервере выполните:

```bash
cd /var/www/yana_app
git pull origin main
npm install
npm run build
sudo -u nodejs pm2 restart yana_app
```

## Проверка

После установки попробуйте загрузить большой файл (75MB). В логах должно появиться:

```
[TRANSCRIBE] Large file detected, using streaming parser...
[TRANSCRIBE] Streaming file to disk: filename.mp4
[TRANSCRIBE] File saved to disk: /tmp/upload_...
[TRANSCRIBE] Streaming parser completed successfully
```

Если видите эти логи - потоковая загрузка работает!

## Если не работает

1. Проверьте что библиотека установлена:
   ```bash
   npm list @mjackson/form-data-parser
   ```

2. Проверьте логи на ошибки:
   ```bash
   sudo -u nodejs pm2 logs yana_app --lines 0
   ```

3. Проверьте что есть место на диске:
   ```bash
   df -h
   ```

## Преимущества

- Файлы не загружаются целиком в память
- Работает с файлами любого размера (ограничено только местом на диске)
- Меньше нагрузка на память сервера
