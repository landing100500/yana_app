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
# Запустите приложение от имени пользователя nodejs
sudo -u nodejs pm2 start /var/www/yana_app/ecosystem.config.js

# Или если ecosystem.config.js не работает, можно запустить напрямую:
# sudo -u nodejs pm2 start /var/www/yana_app/node_modules/next/dist/bin/next --name yana_app -- start

# Проверьте статус
sudo -u nodejs pm2 status

# Сохраните конфигурацию
sudo -u nodejs pm2 save

# Удалите тестовое приложение
sudo -u nodejs pm2 delete hello-world
```

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

## Обновление приложения (после настройки GitHub Actions)

После настройки автоматического деплоя, обновления будут происходить автоматически при push в `main`.

Для ручного обновления:

```bash
cd /var/www/yana_app
git pull origin main
npm ci --production=false
npm run build
sudo -u nodejs pm2 restart yana_app
```

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
