# Команды PM2 для Beget

## Первый запуск приложения

```bash
# 1. Перейдите в директорию проекта
cd /var/www/yana_app

# 2. Проверьте текущий статус PM2
sudo -u nodejs pm2 status

# 3. Запустите приложение (первый раз)
sudo -u nodejs pm2 start /var/www/yana_app/ecosystem.config.js

# Или если ecosystem.config.js не работает, запустите напрямую:
sudo -u nodejs pm2 start /var/www/yana_app/node_modules/next/dist/bin/next --name yana_app -- start --port 3000

# 4. Проверьте что запустилось
sudo -u nodejs pm2 status
```

---

## Сохранение конфигурации PM2

```bash
# Сохраните текущую конфигурацию PM2
# Это нужно делать после каждого изменения (start, restart, delete)
sudo -u nodejs pm2 save
```

**Важно:** После каждого `start`, `restart`, `delete` обязательно выполните `pm2 save`, иначе изменения не сохранятся!

---

## Настройка автозапуска при перезагрузке сервера

```bash
# 1. Сначала сохраните текущую конфигурацию
sudo -u nodejs pm2 save

# 2. Настройте автозапуск
sudo -u nodejs pm2 startup

# 3. Команда выведет что-то вроде:
# [PM2] Init System found: systemd
# [PM2] To setup the Startup Script, copy/paste the following command:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u nodejs --hp /home/nodejs
#
# 4. Скопируйте и выполните команду, которую вывел pm2 startup
# (она будет уникальной для вашей системы)
```

**Пример команды, которую нужно выполнить:**
```bash
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u nodejs --hp /home/nodejs
```

После этого приложение будет автоматически запускаться при перезагрузке сервера.

---

## Основные команды PM2

### Проверка статуса
```bash
sudo -u nodejs pm2 status
# или короткая версия:
sudo -u nodejs pm2 ls
```

### Просмотр логов
```bash
# Все логи
sudo -u nodejs pm2 logs yana_app

# Последние 50 строк
sudo -u nodejs pm2 logs yana_app --lines 50

# Только ошибки
sudo -u nodejs pm2 logs yana_app --err

# Только вывод
sudo -u nodejs pm2 logs yana_app --out

# Следить за логами в реальном времени
sudo -u nodejs pm2 logs yana_app --lines 0
```

### Управление приложением
```bash
# Перезапустить приложение
sudo -u nodejs pm2 restart yana_app

# Остановить приложение
sudo -u nodejs pm2 stop yana_app

# Запустить остановленное приложение
sudo -u nodejs pm2 start yana_app

# Удалить приложение из PM2
sudo -u nodejs pm2 delete yana_app

# Перезагрузить приложение (zero-downtime restart)
sudo -u nodejs pm2 reload yana_app
```

### Мониторинг
```bash
# Мониторинг в реальном времени (CPU, память)
sudo -u nodejs pm2 monit

# Информация о приложении
sudo -u nodejs pm2 show yana_app

# Список всех процессов
sudo -u nodejs pm2 list
```

### Очистка логов
```bash
# Очистить все логи
sudo -u nodejs pm2 flush
```

---

## Полная последовательность для первого запуска

```bash
# 1. Перейдите в директорию
cd /var/www/yana_app

# 2. Запустите приложение
sudo -u nodejs pm2 start /var/www/yana_app/ecosystem.config.js

# 3. Проверьте статус
sudo -u nodejs pm2 status

# 4. Сохраните конфигурацию
sudo -u nodejs pm2 save

# 5. Настройте автозапуск
sudo -u nodejs pm2 startup
# Выполните команду, которую выведет pm2 startup

# 6. Проверьте логи (опционально)
sudo -u nodejs pm2 logs yana_app --lines 20
```

---

## Проверка что автозапуск работает

```bash
# 1. Проверьте статус
sudo -u nodejs pm2 status

# 2. Проверьте что startup скрипт создан
sudo systemctl status pm2-nodejs

# 3. Можно протестировать (опционально):
# sudo reboot
# После перезагрузки проверьте: sudo -u nodejs pm2 status
```

---

## Удаление тестового приложения hello-world

```bash
# Остановите тестовое приложение
sudo -u nodejs pm2 stop hello-world

# Удалите его
sudo -u nodejs pm2 delete hello-world

# Сохраните изменения
sudo -u nodejs pm2 save
```

---

## Полезные команды для отладки

```bash
# Просмотр детальной информации о процессе
sudo -u nodejs pm2 describe yana_app

# Перезапуск с очисткой логов
sudo -u nodejs pm2 restart yana_app --update-env
sudo -u nodejs pm2 flush

# Проверка переменных окружения
sudo -u nodejs pm2 env 0  # 0 - это ID процесса (можно посмотреть в pm2 status)
```

---

## Важные замечания

1. **Всегда используйте `sudo -u nodejs`** на Beget, так как PM2 должен работать от имени пользователя `nodejs`

2. **После каждого изменения выполняйте `pm2 save`**, иначе изменения не сохранятся

3. **Для автозапуска нужно выполнить команду, которую выводит `pm2 startup`** - это создаст systemd сервис

4. **Логи находятся в:**
   - `/var/www/yana_app/logs/pm2-error.log` (ошибки)
   - `/var/www/yana_app/logs/pm2-out.log` (вывод)

5. **Если приложение не запускается**, проверьте:
   - Логи: `sudo -u nodejs pm2 logs yana_app --err`
   - Переменные окружения в `.env.production`
   - Что порт 3000 свободен: `netstat -tulpn | grep 3000`
