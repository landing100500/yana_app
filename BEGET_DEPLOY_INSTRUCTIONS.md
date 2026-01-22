# Инструкция по деплою на Beget VPS

## Текущая инфраструктура Beget
- Домен: `yasna.chat` и `www.yasna.chat`
- Пользователь для PM2: `nodejs`
- Директория приложения: `/var/www/yana_app`
- Порт: `3000`
- SSL сертификат: уже настроен через Certbot

---

## Шаг 1: Остановка тестового приложения

```bash
# Остановите тестовое приложение
sudo -u nodejs pm2 stop hello-world
```

---

## Шаг 2: Переход в директорию проекта

```bash
# Перейдите в директорию проекта (уже склонированную)
cd /var/www/yana_app
```

---

## Шаг 3: Установка зависимостей

```bash
# Убедитесь, что вы в правильной директории
cd /var/www/yana_app

# Установите зависимости
npm ci --production=false

# Если возникнут проблемы с памятью, создайте swap:
# sudo fallocate -l 4G /swapfile
# sudo chmod 600 /swapfile
# sudo mkswap /swapfile
# sudo swapon /swapfile
```

---

## Шаг 4: Сборка проекта

```bash
# Соберите проект
npm run build
```

---

## Шаг 5: Создание .env.production

```bash
# Создайте файл с переменными окружения
nano /var/www/yana_app/.env.production
```

Добавьте все необходимые переменные (см. пример ниже).

---

## Шаг 6: Создание директории для логов

```bash
# Создайте директорию для логов
mkdir -p /var/www/yana_app/logs

# Установите правильные права
sudo chown -R nodejs:nodejs /var/www/yana_app
```

---

## Шаг 7: Запуск приложения через PM2

```bash
# Проверьте текущий статус PM2
sudo -u nodejs pm2 status

# Запустите приложение от имени пользователя nodejs
# Если приложение еще не запускалось, используйте start:
sudo -u nodejs pm2 start /var/www/yana_app/ecosystem.config.js

# Если приложение уже запущено, используйте restart:
# sudo -u nodejs pm2 restart yana_app

# Или если ecosystem.config.js не работает, можно запустить напрямую:
# sudo -u nodejs pm2 start /var/www/yana_app/node_modules/next/dist/bin/next --name yana_app -- start

# Проверьте статус (должен быть "online")
sudo -u nodejs pm2 status

# Сохраните конфигурацию для автозапуска
sudo -u nodejs pm2 save

# Удалите тестовое приложение (если еще не удалено)
sudo -u nodejs pm2 delete hello-world
sudo -u nodejs pm2 save
```

**Если получили ошибку "Process or Namespace yana_app not found":**
- Это нормально при первом запуске
- Используйте `pm2 start ecosystem.config.js` вместо `pm2 restart yana_app`

---

## Шаг 9: Настройка nginx

### 9.1 Обновите конфигурацию nginx

Файл конфигурации уже существует. Обновите его:

```bash
sudo nano /etc/nginx/sites-available/nodejs.conf
```

Замените содержимое на (см. обновленную конфигурацию ниже).

### 9.2 Проверьте и перезагрузите nginx

**⚠️ ВАЖНО: После изменения конфигурации nginx обязательно выполните эти команды!**

```bash
# Проверьте конфигурацию (если ошибок нет, увидите "syntax is ok")
sudo nginx -t

# Перезагрузите nginx (применяет изменения без остановки сервиса)
sudo systemctl reload nginx

# Или если reload не работает, используйте restart:
# sudo systemctl restart nginx
```

---

## Обновленная конфигурация nginx для Next.js

```nginx
server {
    root /var/www/yana_app;

    server_name yasna.chat www.yasna.chat;

    # Размер загружаемых файлов (для админ-панели с видео)
    client_max_body_size 500M;
    client_body_timeout 300s;
    client_header_timeout 300s;

    # Gzip сжатие
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1000;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # Кеширование статических файлов Next.js
    location /_next/static {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 60m;
        add_header Cache-Control "public, immutable";
        expires 1y;
    }

    # Кеширование других статических файлов
    location /static {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 60m;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Кеширование assets (если используется)
    location ^~ /assets/ {
        proxy_pass http://localhost:3000;
        gzip_static on;
        expires 12h;
        add_header Cache-Control public;
    }

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
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;

        proxy_pass http://localhost:3000;
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/yasna.chat/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/yasna.chat/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = www.yasna.chat) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    if ($host = yasna.chat) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    server_name yasna.chat www.yasna.chat;
    return 404; # managed by Certbot
}
```

---

## Пример .env.production

```env
# Окружение
NODE_ENV=production
PORT=3000

# База данных MySQL
DB_HOST=localhost
DB_PORT=3306
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password

# JWT
JWT_SECRET=your-very-secure-secret-key-change-this-in-production

# OpenAI
API_GPT=your-openai-api-key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# SMS (когда будет готово)
API_ID_SMS=your-sms-api-key
```

---

## Проверка работы

```bash
# Проверьте статус PM2
sudo -u nodejs pm2 status

# Проверьте логи
sudo -u nodejs pm2 logs yana_app

# Проверьте, что порт 3000 слушается
netstat -tulpn | grep 3000

# Проверьте nginx
sudo nginx -t
sudo systemctl status nginx
```

Откройте в браузере `https://yasna.chat` и проверьте работу приложения.

---

## Обновление приложения

### Ручное обновление (если автоматический деплой не настроен)

```bash
# Перейдите в директорию проекта
cd /var/www/yana_app

# Скачайте последние изменения с GitHub
git pull origin main

# Если есть конфликты, можно принудительно обновить:
# git fetch origin
# git reset --hard origin/main

# Установите зависимости (если изменились package.json)
npm ci --production=false

# Соберите проект
npm run build

# Перезапустите приложение
sudo -u nodejs pm2 restart yana_app
```

### Автоматический деплой (через GitHub Actions)

**Статус:** Workflow настроен, но требует настройки GitHub Secrets.

**Как проверить настроен ли автоматический деплой:**
1. Перейдите в GitHub репозиторий → вкладка **Actions**
2. Если видите успешные запуски при push в `main` — деплой работает
3. Если видите ошибки или нет запусков — нужно настроить Secrets

**Как настроить автоматический деплой:**

1. Перейдите в GitHub репозиторий → **Settings** → **Secrets and variables** → **Actions**

2. Добавьте следующие секреты:

   - **VPS_HOST** — IP или домен вашего VPS (например: `yasna.chat` или IP адрес)
   - **VPS_USER** — пользователь для SSH (обычно `root` для Beget)
   - **VPS_SSH_KEY** — приватный SSH ключ для подключения к серверу
   - **VPS_DEPLOY_PATH** — путь к проекту (можно не указывать, по умолчанию `/var/www/yana_app`)
   - **VPS_SSH_PORT** — порт SSH (можно не указывать, по умолчанию `22`)

   **Или используйте пароль вместо SSH ключа:**
   - **VPS_PASSWORD** — пароль для SSH (менее безопасно)

3. После добавления секретов, при каждом `git push origin main` будет автоматически:
   - Запускаться проверки (lint, build)
   - Деплоиться на сервер
   - Перезапускаться PM2

**Проверка работы:**
- Сделайте тестовый коммит и push
- Перейдите в **Actions** и посмотрите статус деплоя
- Если всё зелёное ✅ — автоматический деплой работает!

---

## Полезные команды

### PM2 (от имени nodejs)
```bash
sudo -u nodejs pm2 status
sudo -u nodejs pm2 logs yana_app
sudo -u nodejs pm2 restart yana_app
sudo -u nodejs pm2 stop yana_app
sudo -u nodejs pm2 delete yana_app
sudo -u nodejs pm2 monit
```

### nginx
```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

---

## Обновление GitHub Actions workflow

Workflow уже настроен для использования `/var/www/yana_app` по умолчанию.

Убедитесь, что в GitHub Secrets установлен:
- `VPS_DEPLOY_PATH` = `/var/www/yana_app` (или оставьте пустым, используется по умолчанию)

---

**Готово! После выполнения этих шагов ваше приложение будет работать на yasna.chat**
