# Инструкция по настройке деплоя на VPS

> **Для Beget VPS**: См. специальную инструкцию `BEGET_DEPLOY_INSTRUCTIONS.md`

## Шаг 1: Подготовка GitHub Secrets

Перейдите в настройки репозитория GitHub: `Settings → Secrets and variables → Actions`

Добавьте следующие секреты:

1. **VPS_HOST** - IP адрес или домен вашего VPS сервера
   - Пример: `123.45.67.89` или `your-domain.com`

2. **VPS_USER** - пользователь для SSH подключения
   - Обычно: `root` или `beget` (зависит от настроек Beget)

3. **VPS_SSH_KEY** или **VPS_PASSWORD** - выберите один из вариантов:

   **Вариант A: SSH ключ (рекомендуется, более безопасно)**
   
   **A1. Генерация на вашем компьютере:**
   - См. подробную инструкцию в файле `SSH_KEY_SETUP.md`
   - Кратко:
     ```bash
     # Генерация ключа
     ssh-keygen -t rsa -b 4096 -C "github-deploy"
     
     # Добавление на сервер
     ssh-copy-id -i ~/.ssh/id_rsa.pub user@your-vps-ip
     
     # Скопируйте приватный ключ в секрет VPS_SSH_KEY
     cat ~/.ssh/id_rsa
     ```
   
   **A2. Генерация прямо на сервере (если удобнее):**
   - См. подробную инструкцию в файле `GENERATE_SSH_KEY_ON_SERVER.md`
   - Кратко (выполните на сервере):
     ```bash
     ssh-keygen -t rsa -b 4096 -C "github-deploy" -f ~/.ssh/github_deploy -N ""
     cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
     chmod 600 ~/.ssh/authorized_keys
     cat ~/.ssh/github_deploy  # Скопируйте этот вывод в GitHub Secrets
     ```
   - Вставьте весь текст приватного ключа (включая `-----BEGIN...` и `-----END...`)

   **Вариант B: Пароль (менее безопасно, но проще для начала)**
   - См. инструкцию в файле `QUICK_START_PASSWORD.md`
   - Просто добавьте ваш пароль от VPS в секрет **VPS_PASSWORD**
   - ⚠️ В workflow файле раскомментируйте строку с `password` и закомментируйте `key`

4. **VPS_SSH_PORT** (опционально) - порт SSH, по умолчанию 22

5. **VPS_DEPLOY_PATH** (опционально) - путь к проекту на сервере
   - По умолчанию: `/var/www/yana_app`

---

## Шаг 2: Настройка сервера

### 2.1 Подключитесь к серверу по SSH

```bash
ssh user@your-vps-ip
```

### 2.2 Создайте директорию для проекта

```bash
sudo mkdir -p /var/www/yana_app
sudo mkdir -p /var/www/yana_app/logs
sudo chown -R $USER:$USER /var/www/yana_app
```

### 2.3 Клонируйте репозиторий

**Вариант A: Если папка yana_app уже создана (пустая)**

```bash
cd /var/www
rmdir yana_app 2>/dev/null || true  # Удалить пустую папку
git clone https://github.com/your-username/your-repo.git yana_app
cd yana_app
```

**Вариант B: Клонировать прямо в существующую папку**

```bash
cd /var/www/yana_app
git clone https://github.com/your-username/your-repo.git .
# Или если используете SSH:
# git clone git@github.com:your-username/your-repo.git .
```

**Вариант C: Через SSH (если настроен SSH ключ для GitHub)**

```bash
cd /var/www
rmdir yana_app 2>/dev/null || true
git clone git@github.com:your-username/your-repo.git yana_app
cd yana_app
```

📝 **Подробная инструкция**: См. файл `CLONE_REPO_INSTRUCTIONS.md`

### 2.4 Установите зависимости и соберите проект

```bash
npm ci --production=false
npm run build
```

### 2.5 Настройте переменные окружения

Создайте файл `.env.production`:

```bash
nano /var/www/yana_app/.env.production
```

Добавьте все необходимые переменные (см. пример ниже).

### 2.6 Скопируйте конфигурацию PM2

Убедитесь, что `ecosystem.config.js` находится в корне проекта.

### 2.7 Запустите приложение через PM2

```bash
cd /var/www/yana_app
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Выполните команду, которую выведет `pm2 startup` (обычно что-то вроде `sudo env PATH=...`).

---

## Шаг 3: Настройка nginx

### 3.1 Создайте конфигурационный файл

```bash
sudo nano /etc/nginx/sites-available/yana_app
```

Скопируйте содержимое из `nginx.conf.example` и замените `your-domain.com` на ваш домен.

### 3.2 Активируйте конфигурацию

```bash
# Создать символическую ссылку
sudo ln -s /etc/nginx/sites-available/yana_app /etc/nginx/sites-enabled/

# Удалить или отключить старую конфигурацию (hello-world)
sudo rm /etc/nginx/sites-enabled/default
# Или закомментируйте её

# Проверить конфигурацию
sudo nginx -t

# Перезагрузить nginx
sudo systemctl reload nginx
```

### 3.3 Настройка SSL (Let's Encrypt)

```bash
# Установить certbot
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Получить сертификат
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Автоматическое обновление (уже настроено в certbot)
```

---

## Шаг 4: Проверка работы

### 4.1 Проверьте статус PM2

```bash
pm2 status
pm2 logs yana_app
```

### 4.2 Проверьте работу приложения

Откройте в браузере ваш домен и проверьте:
- Главная страница открывается
- Авторизация работает
- API endpoints отвечают

### 4.3 Проверьте логи

```bash
# Логи PM2
pm2 logs yana_app

# Логи nginx
sudo tail -f /var/log/nginx/yana_app_access.log
sudo tail -f /var/log/nginx/yana_app_error.log
```

---

## Шаг 5: Тестирование автоматического деплоя

### 5.1 Сделайте тестовый коммит

```bash
git add .
git commit -m "Test deployment"
git push origin main
```

### 5.2 Проверьте GitHub Actions

Перейдите в `Actions` в вашем репозитории GitHub и проверьте, что workflow запустился и выполнился успешно.

### 5.3 Проверьте обновление на сервере

```bash
ssh user@your-vps-ip
cd /var/www/yana_app
git log -1  # Проверить последний коммит
pm2 status  # Проверить, что приложение работает
```

---

## Переменные окружения для .env.production

Пример содержимого `.env.production`:

```env
# Окружение
NODE_ENV=production

# База данных MySQL
DB_HOST=localhost
DB_PORT=3306
DB_NAME=your_database
DB_USER=your_user
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your-very-secure-secret-key-change-this

# OpenAI
API_GPT=your-openai-api-key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# SMS (когда будет готово)
API_ID_SMS=your-sms-api-key

# Порт (опционально, по умолчанию 3000)
PORT=3000
```

---

## Полезные команды

### Управление PM2

```bash
# Статус
pm2 status

# Логи
pm2 logs yana_app
pm2 logs yana_app --lines 100  # Последние 100 строк

# Перезапуск
pm2 restart yana_app

# Остановка
pm2 stop yana_app

# Удаление из PM2
pm2 delete yana_app

# Мониторинг
pm2 monit
```

### Управление nginx

```bash
# Проверка конфигурации
sudo nginx -t

# Перезагрузка
sudo systemctl reload nginx

# Перезапуск
sudo systemctl restart nginx

# Статус
sudo systemctl status nginx
```

### Ручное обновление (если нужно)

```bash
cd /var/www/yana_app
git pull origin main
npm ci --production=false
npm run build
pm2 restart yana_app
```

---

## Решение проблем

### Приложение не запускается

1. Проверьте логи: `pm2 logs yana_app`
2. Проверьте переменные окружения
3. Проверьте, что порт 3000 свободен: `netstat -tulpn | grep 3000`
4. Проверьте права доступа к файлам

### nginx не проксирует запросы

1. Проверьте конфигурацию: `sudo nginx -t`
2. Проверьте, что Next.js запущен: `pm2 status`
3. Проверьте логи nginx: `sudo tail -f /var/log/nginx/error.log`

### GitHub Actions не подключается к серверу

1. Проверьте SSH ключ в секретах
2. Проверьте, что публичный ключ добавлен на сервер
3. Проверьте доступность сервера: `ping your-vps-ip`
4. Проверьте файрвол: `sudo ufw status`

---

## Безопасность

- ✅ Не коммитьте `.env` файлы в Git
- ✅ Используйте сильные пароли и секретные ключи
- ✅ Настройте файрвол (UFW) на сервере
- ✅ Регулярно обновляйте систему: `sudo apt update && sudo apt upgrade`
- ✅ Используйте SSL сертификаты (HTTPS)
- ✅ Ограничьте SSH доступ (отключите root, используйте ключи)

---

**Готово!** Теперь при каждом push в ветку `main`/`master` будет автоматически выполняться деплой на ваш VPS.
