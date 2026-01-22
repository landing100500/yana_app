# Следующие шаги после успешной сборки

## ✅ Что уже сделано:
- ✅ Репозиторий клонирован
- ✅ Зависимости установлены
- ✅ Проект собран (`npm run build`)

---

## Шаг 1: Создание .env.production

На сервере создайте файл с переменными окружения:

```bash
cd /var/www/yana_app
nano .env.production
```

Добавьте все необходимые переменные (см. пример ниже).

**Важно:** Не коммитьте этот файл в Git! Он уже в `.gitignore`.

---

## Шаг 2: Запуск через PM2

```bash
# Убедитесь, что вы в правильной директории
cd /var/www/yana_app

# Создайте директорию для логов (если еще нет)
mkdir -p logs

# Запустите приложение
pm2 start ecosystem.config.js

# Проверьте статус
pm2 status

# Сохраните конфигурацию PM2
pm2 save

# Настройте автозапуск при перезагрузке сервера
pm2 startup
# Выполните команду, которую выведет pm2 startup (обычно что-то вроде:
# sudo env PATH=... pm2 startup systemd -u root --hp /root)
```

---

## Шаг 3: Проверка работы приложения

```bash
# Проверьте логи
pm2 logs yana_app

# Проверьте, что приложение слушает порт 3000
netstat -tulpn | grep 3000
# Или
ss -tulpn | grep 3000
```

Должно показать, что порт 3000 занят процессом Node.js.

---

## Шаг 4: Настройка nginx

### 4.1 Создайте конфигурационный файл

```bash
sudo nano /etc/nginx/sites-available/yana_app
```

Скопируйте содержимое из `nginx.conf.example` и замените `your-domain.com` на ваш домен.

### 4.2 Активируйте конфигурацию

```bash
# Создайте символическую ссылку
sudo ln -s /etc/nginx/sites-available/yana_app /etc/nginx/sites-enabled/

# Удалите или отключите старую конфигурацию (hello-world)
sudo rm /etc/nginx/sites-enabled/default
# Или закомментируйте её

# Проверьте конфигурацию
sudo nginx -t

# Если всё ок, перезагрузите nginx
sudo systemctl reload nginx
```

---

## Шаг 5: Настройка SSL (Let's Encrypt)

```bash
# Установите certbot
sudo apt update
sudo apt install -y certbot python3-certbot-nginx

# Получите сертификат
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Автоматическое обновление уже настроено
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

После настройки nginx откройте в браузере ваш домен и проверьте:
- ✅ Главная страница открывается
- ✅ Авторизация работает
- ✅ Страницы загружаются
- ✅ API endpoints отвечают

---

## Полезные команды

### PM2
```bash
pm2 status          # Статус
pm2 logs yana_app    # Логи
pm2 restart yana_app # Перезапуск
pm2 stop yana_app    # Остановка
pm2 monit            # Мониторинг
```

### nginx
```bash
sudo nginx -t                    # Проверка конфигурации
sudo systemctl reload nginx      # Перезагрузка
sudo systemctl status nginx      # Статус
sudo tail -f /var/log/nginx/error.log  # Логи ошибок
```

### Git (для обновлений)
```bash
cd /var/www/yana_app
git pull origin main
npm ci --production=false
npm run build
pm2 restart yana_app
```

---

**Готово! После выполнения этих шагов ваше приложение будет работать на вашем домене.**
