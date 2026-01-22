# Дорожная карта: Настройка автоматического деплоя на VPS (Beget)

## Текущая инфраструктура
- ✅ VPS: Beget, Ubuntu 22.04.01
- ✅ Node.js 22.x установлен
- ✅ nginx 1.18.0 установлен и настроен
- ✅ PM2 5.2.2 установлен
- ✅ Домен настроен и открывается тестовое приложение `/var/www/html/hello-world.js`
- ✅ GitHub репозиторий с проектом

---

## Этап 1: Подготовка сервера

### 1.1 Подготовка директорий
- [ ] Создать директорию для проекта: `/var/www/yana_app`
- [ ] Настроить права доступа для пользователя
- [ ] Создать директорию для логов: `/var/www/yana_app/logs`

### 1.2 Настройка Git на сервере
- [ ] Установить Git (если не установлен): `sudo apt install git`
- [ ] Настроить SSH ключи для доступа к GitHub:
  - [ ] Сгенерировать SSH ключ на сервере
  - [ ] Добавить публичный ключ в GitHub (Deploy keys или SSH keys)
  - [ ] Проверить подключение к GitHub

### 1.3 Установка зависимостей
- [ ] Установить необходимые системные пакеты:
  - `build-essential` (для компиляции нативных модулей)
  - `python3` (для некоторых npm пакетов)
- [ ] Проверить версию Node.js: `node -v` (должна быть 22.x)
- [ ] Проверить версию npm: `npm -v`

---

## Этап 2: Настройка GitHub Actions для CI/CD

### 2.1 Создание workflow файла
- [ ] Создать директорию: `.github/workflows/`
- [ ] Создать файл: `.github/workflows/deploy.yml`
- [ ] Настроить триггеры:
  - Запуск при push в ветку `main`/`master`
  - Опционально: при создании тега

### 2.2 Настройка проверок (CI)
- [ ] Установка зависимостей: `npm ci`
- [ ] Линтинг: `npm run lint`
- [ ] Проверка типов TypeScript: `tsc --noEmit`
- [ ] Сборка проекта: `npm run build`
- [ ] Проверка успешности сборки

### 2.3 Настройка деплоя (CD)
- [ ] Настройка SSH подключения к серверу:
  - Добавить SSH секреты в GitHub Secrets:
    - `VPS_HOST` - IP адрес или домен VPS
    - `VPS_USER` - пользователь для SSH (обычно `root` или `beget`)
    - `VPS_SSH_KEY` - приватный SSH ключ
    - `VPS_DEPLOY_PATH` - путь на сервере (`/var/www/yana_app`)
- [ ] Настроить деплой через SSH:
  - Подключение к серверу
  - Переход в директорию проекта
  - Pull последних изменений из GitHub
  - Установка зависимостей
  - Сборка проекта
  - Перезапуск приложения через PM2

---

## Этап 3: Настройка PM2

### 3.1 Создание конфигурации PM2
- [ ] Создать файл `ecosystem.config.js` в корне проекта:
  - Настройка для production режима
  - Указать путь к собранному приложению
  - Настроить переменные окружения
  - Настроить логирование
  - Настроить автозапуск при перезагрузке сервера

### 3.2 Настройка PM2 на сервере
- [ ] Скопировать `ecosystem.config.js` на сервер
- [ ] Настроить автозапуск: `pm2 startup`
- [ ] Сохранить текущую конфигурацию: `pm2 save`

---

## Этап 4: Настройка nginx

### 4.1 Создание конфигурации nginx
- [ ] Создать конфигурационный файл: `/etc/nginx/sites-available/yana_app`
- [ ] Настроить:
  - Проксирование на локальный порт Next.js (обычно 3000)
  - SSL сертификаты (Let's Encrypt)
  - Заголовки безопасности
  - Gzip сжатие
  - Кеширование статических файлов
  - Обработка ошибок

### 4.2 Активация конфигурации
- [ ] Создать символическую ссылку: `ln -s /etc/nginx/sites-available/yana_app /etc/nginx/sites-enabled/`
- [ ] Удалить или отключить старую конфигурацию (hello-world)
- [ ] Проверить конфигурацию: `sudo nginx -t`
- [ ] Перезагрузить nginx: `sudo systemctl reload nginx`

---

## Этап 5: Настройка переменных окружения

### 5.1 Создание .env файла на сервере
- [ ] Создать файл `.env.production` на сервере
- [ ] Добавить все необходимые переменные:
  - `NODE_ENV=production`
  - `DATABASE_URL` (если используется)
  - `JWT_SECRET`
  - `API_GPT`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `API_ID_SMS` (когда будет готово)
  - И другие необходимые переменные

### 5.2 Безопасность
- [ ] Убедиться, что `.env` файлы не попадают в Git
- [ ] Проверить `.gitignore`
- [ ] Настроить права доступа к `.env` файлу (только для владельца)

---

## Этап 6: Первоначальный деплой

### 6.1 Клонирование репозитория на сервер
- [ ] Клонировать репозиторий в `/var/www/yana_app`
- [ ] Переключиться на нужную ветку (обычно `main` или `master`)

### 6.2 Установка и сборка
- [ ] Установить зависимости: `npm ci --production=false`
- [ ] Собрать проект: `npm run build`
- [ ] Проверить успешность сборки

### 6.3 Запуск через PM2
- [ ] Запустить приложение: `pm2 start ecosystem.config.js`
- [ ] Проверить статус: `pm2 status`
- [ ] Проверить логи: `pm2 logs yana_app`

### 6.4 Проверка работы
- [ ] Проверить доступность приложения по домену
- [ ] Проверить все основные страницы
- [ ] Проверить работу API endpoints

---

## Этап 7: Настройка мониторинга и логирования

### 7.1 PM2 мониторинг
- [ ] Настроить PM2 Plus (опционально, для мониторинга)
- [ ] Настроить ротацию логов
- [ ] Настроить алерты при падении приложения

### 7.2 Логирование
- [ ] Настроить централизованное логирование (опционально)
- [ ] Настроить ротацию логов nginx
- [ ] Настроить ротацию логов PM2

---

## Технические детали

### Структура директорий на сервере
```
/var/www/yana_app/
├── .next/              # Собранное приложение
├── node_modules/       # Зависимости
├── public/             # Статические файлы
├── .env.production     # Переменные окружения
├── ecosystem.config.js # Конфигурация PM2
├── package.json
└── ...                 # Остальные файлы проекта
```

### Пример ecosystem.config.js
```javascript
module.exports = {
  apps: [{
    name: 'yana_app',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: '/var/www/yana_app',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/www/yana_app/logs/pm2-error.log',
    out_file: '/var/www/yana_app/logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G'
  }]
};
```

### Пример nginx конфигурации
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    
    # Редирект на HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    # Проксирование на Next.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Кеширование статических файлов
    location /_next/static {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 60m;
        add_header Cache-Control "public, immutable";
    }
}
```

### Пример GitHub Actions workflow
```yaml
name: Deploy to VPS

on:
  push:
    branches: [ main, master ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run lint
      - run: npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to VPS
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd ${{ secrets.VPS_DEPLOY_PATH }}
            git pull origin main
            npm ci --production=false
            npm run build
            pm2 restart yana_app
```

---

## Переменные окружения для GitHub Secrets

Добавить в Settings → Secrets and variables → Actions:
- `VPS_HOST` - IP или домен VPS сервера
- `VPS_USER` - пользователь SSH (обычно `root` или `beget`)
- `VPS_SSH_KEY` - приватный SSH ключ для подключения
- `VPS_DEPLOY_PATH` - путь к проекту на сервере (`/var/www/yana_app`)

---

## Команды для выполнения на сервере

### Первоначальная настройка
```bash
# Создать директорию
sudo mkdir -p /var/www/yana_app
sudo chown -R $USER:$USER /var/www/yana_app

# Клонировать репозиторий
cd /var/www/yana_app
git clone <your-repo-url> .

# Установить зависимости
npm ci --production=false

# Собрать проект
npm run build

# Запустить через PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Обновление после деплоя
```bash
cd /var/www/yana_app
git pull origin main
npm ci --production=false
npm run build
pm2 restart yana_app
```

---

## Приоритеты

1. **Высокий приоритет:**
   - Настройка GitHub Actions
   - Настройка nginx
   - Настройка PM2
   - Первоначальный деплой

2. **Средний приоритет:**
   - Настройка SSL сертификатов
   - Оптимизация nginx (кеширование, gzip)
   - Мониторинг и логирование

3. **Низкий приоритет:**
   - Настройка резервного копирования
   - Настройка алертов
   - Оптимизация производительности

---

## Заметки

- Beget может иметь специфичные настройки для nginx
- Проверить, какой пользователь используется для веб-сервера (обычно `www-data` или `nginx`)
- Убедиться, что порт 3000 не заблокирован файрволом
- Для SSL можно использовать Let's Encrypt через certbot
- PM2 должен запускаться от пользователя, который имеет доступ к проекту

---

## Следующие шаги

1. ✅ Создана дорожная карта
2. ⏳ Начать с настройки GitHub Actions
3. ⏳ Создать конфигурацию PM2
4. ⏳ Настроить nginx
5. ⏳ Выполнить первоначальный деплой

---

**Дата создания:** 2025-01-XX  
**Последнее обновление:** 2025-01-XX
