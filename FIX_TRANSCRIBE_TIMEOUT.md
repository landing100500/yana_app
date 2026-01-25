# Исправление таймаутов для транскрибации видео

## Проблема

Ошибка `ECONNRESET` (aborted) при загрузке видео - соединение разрывается из-за таймаутов.

## Решение

### Шаг 1: Обновите конфигурацию nginx

```bash
# Откройте конфигурацию nginx
sudo nano /etc/nginx/sites-available/nodejs.conf
```

Замените секцию с таймаутами на:

```nginx
    # Размер загружаемых файлов (для админ-панели с видео)
    client_max_body_size 500M;
    client_body_timeout 1800s;  # 30 минут для загрузки больших файлов
    client_header_timeout 300s;
    send_timeout 1800s;  # Таймаут отправки данных

    # ...

    # Основное проксирование на Next.js
    location / {
        proxy_http_version 1.1;
        proxy_cache_bypass $http_upgrade;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        # Таймауты для больших запросов (транскрибация видео)
        # Увеличено до 30 минут для обработки больших видео файлов
        proxy_connect_timeout 1800s;
        proxy_send_timeout 1800s;
        proxy_read_timeout 1800s;
        proxy_buffering off;  # Отключаем буферизацию для стриминга

        proxy_pass http://localhost:3000;
    }
```

### Шаг 2: Проверьте и перезагрузите nginx

```bash
# Проверьте конфигурацию
sudo nginx -t

# Если ошибок нет, перезагрузите nginx
sudo systemctl reload nginx
```

### Шаг 3: Перезапустите приложение

```bash
sudo -u nodejs pm2 restart yana_app
```

### Шаг 4: Проверьте логи

```bash
# Смотрите логи в реальном времени
sudo -u nodejs pm2 logs yana_app --lines 0

# В другом терминале проверьте логи nginx
sudo tail -f /var/log/nginx/error.log
```

---

## Альтернативное решение: Проверка что файл доходит до сервера

Если проблема не в таймаутах, проверьте:

### 1. Проверьте логи nginx при загрузке

```bash
sudo tail -f /var/log/nginx/access.log
```

Попробуйте загрузить файл и посмотрите, появляется ли запрос в логах.

### 2. Проверьте размер файла

Убедитесь, что файл не превышает 500MB (лимит в nginx).

### 3. Проверьте что приложение получает запрос

Добавьте логирование в начало обработки запроса (уже есть в коде).

### 4. Проверьте переменные окружения

```bash
cd /var/www/yana_app
cat .env.production | grep -i "API_GPT\|SUPABASE"
```

Убедитесь, что все переменные окружения установлены.

---

## Дополнительные настройки (если проблема сохраняется)

### Увеличьте таймауты в Next.js (если нужно)

В `next.config.js` можно добавить:

```javascript
const nextConfig = {
  // ...
  serverRuntimeConfig: {
    // Таймауты для API routes
    apiTimeout: 1800000, // 30 минут
  },
}
```

Но обычно `maxDuration` в route.ts достаточно.

---

## Проверка работы

После применения изменений:

1. Попробуйте загрузить небольшой видео файл (1-5MB)
2. Если работает, попробуйте больший файл
3. Следите за логами PM2 в реальном времени

Если проблема сохраняется, проверьте:
- Логи nginx: `sudo tail -f /var/log/nginx/error.log`
- Логи PM2: `sudo -u nodejs pm2 logs yana_app --lines 0`
- Размер файла и доступное место на диске: `df -h`
