# Исправление ошибки "Killed" при npm install

## Проблема: Нехватка памяти (OOM - Out Of Memory)

Ошибка "Killed" означает, что система убила процесс из-за нехватки оперативной памяти (RAM).

---

## Решение 1: Проверьте доступную память

```bash
# Проверьте использование памяти
free -h

# Проверьте, есть ли swap
swapon --show
```

---

## Решение 2: Создайте swap файл (рекомендуется)

Если swap нет или он маленький, создайте:

```bash
# 1. Создайте swap файл (4GB - можно изменить размер)
sudo fallocate -l 4G /swapfile

# 2. Установите правильные права
sudo chmod 600 /swapfile

# 3. Сделайте swap файл
sudo mkswap /swapfile

# 4. Активируйте swap
sudo swapon /swapfile

# 5. Сделайте постоянным (после перезагрузки)
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 6. Проверьте
free -h
swapon --show
```

---

## Решение 3: Используйте npm ci вместо npm install

`npm ci` более эффективен по памяти:

```bash
npm ci --production=false
```

---

## Решение 4: Установка с ограничением памяти

```bash
# Установите зависимости с ограничением памяти Node.js
NODE_OPTIONS='--max-old-space-size=2048' npm install
```

Или попробуйте установить без опциональных зависимостей:

```bash
npm install --no-optional
```

---

## Решение 5: Установка по частям (если ничего не помогает)

```bash
# 1. Установите только основные зависимости
npm install --no-save next react react-dom

# 2. Затем остальные
npm install
```

---

## Решение 6: Очистка кеша npm

```bash
# Очистите кеш npm
npm cache clean --force

# Попробуйте снова
npm install
```

---

## Полный список команд (рекомендуемый порядок)

```bash
# 1. Проверьте память
free -h

# 2. Создайте swap (если нет или маленький)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 3. Проверьте swap
free -h

# 4. Очистите кеш npm
npm cache clean --force

# 5. Попробуйте установить с ограничением памяти
NODE_OPTIONS='--max-old-space-size=2048' npm ci --production=false
```

---

## Проверка размера VPS

Если у вас очень маленький VPS (менее 1GB RAM), может потребоваться:
- Увеличить swap до 4-8GB
- Или обновить тариф VPS

Проверьте:
```bash
# Общий объем памяти
free -h

# Информация о системе
uname -a
cat /proc/meminfo | head -5
```

---

## Альтернатива: Установка на локальной машине и копирование

Если ничего не помогает, можно:
1. Установить зависимости на локальной машине
2. Скопировать `node_modules` на сервер (но это не рекомендуется из-за нативных модулей)

---

**Рекомендую начать с создания swap файла (Решение 2) - это решит проблему в большинстве случаев.**
