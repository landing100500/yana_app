# Ручное обновление приложения на сервере

## Быстрая команда

```bash
cd /var/www/yana_app && git pull origin main && npm ci --production=false && npm run build && sudo -u nodejs pm2 restart yana_app
```

## Пошагово

### 1. Перейдите в директорию проекта
```bash
cd /var/www/yana_app
```

### 2. Проверьте текущую ветку и статус
```bash
git status
git branch
```

### 3. Скачайте изменения с GitHub

**Вариант 1: Обычное обновление (если нет локальных изменений)**
```bash
git pull origin main
```

**Вариант 2: Принудительное обновление (если есть конфликты)**
```bash
# Сохраните текущие изменения (если нужно)
git stash

# Получите последние изменения
git fetch origin

# Принудительно обновите до версии из GitHub
git reset --hard origin/main
```

**Вариант 3: Если нужно обновить конкретную ветку**
```bash
git fetch origin
git checkout main
git pull origin main
```

### 4. Установите зависимости (если изменились package.json)
```bash
npm ci --production=false
```

### 5. Соберите проект
```bash
npm run build
```

### 6. Перезапустите приложение

**Если приложение уже запущено:**
```bash
sudo -u nodejs pm2 restart yana_app
```

**Если приложение не запущено (ошибка "not found"):**
```bash
sudo -u nodejs pm2 start /var/www/yana_app/ecosystem.config.js
```

**Или проверьте статус и запустите соответственно:**
```bash
# Проверьте статус
sudo -u nodejs pm2 status

# Если yana_app не в списке, запустите:
sudo -u nodejs pm2 start /var/www/yana_app/ecosystem.config.js

# Если yana_app есть, но остановлен, запустите:
sudo -u nodejs pm2 start yana_app

# Если yana_app работает, перезапустите:
sudo -u nodejs pm2 restart yana_app
```

### 7. Проверьте статус
```bash
sudo -u nodejs pm2 status
sudo -u nodejs pm2 logs yana_app --lines 50
```

---

## Если возникли проблемы

### Конфликты при git pull
```bash
# Отмените локальные изменения
git reset --hard HEAD

# Или сохраните их
git stash

# Затем обновите
git pull origin main
```

### Ошибки при сборке
```bash
# Очистите кеш Next.js
rm -rf .next

# Переустановите зависимости
rm -rf node_modules
npm ci --production=false

# Попробуйте собрать снова
npm run build
```

### Приложение не запускается
```bash
# Проверьте логи
sudo -u nodejs pm2 logs yana_app --err

# Проверьте .env.production
cat .env.production

# Перезапустите с очисткой
sudo -u nodejs pm2 delete yana_app
sudo -u nodejs pm2 start ecosystem.config.js
```

---

## Проверка что обновление прошло успешно

1. **Проверьте версию в логах:**
   ```bash
   sudo -u nodejs pm2 logs yana_app | grep -i "version\|started"
   ```

2. **Проверьте в браузере:**
   - Откройте `https://yasna.chat`
   - Проверьте что изменения применились

3. **Проверьте статус PM2:**
   ```bash
   sudo -u nodejs pm2 status
   ```
   Должен быть статус `online` для `yana_app`
