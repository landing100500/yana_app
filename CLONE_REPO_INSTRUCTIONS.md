# Клонирование репозитория на сервер

## Вариант 1: Клонирование через HTTPS (проще, требует логин/пароль)

```bash
# Перейдите в директорию, где создали yana_app
cd /var/www

# Удалите пустую папку yana_app (если она пустая)
rmdir yana_app 2>/dev/null || true

# Клонируйте репозиторий
git clone https://github.com/ваш-username/ваш-репозиторий.git yana_app

# Перейдите в папку проекта
cd yana_app
```

⚠️ **Примечание**: GitHub может попросить логин и пароль. Если у вас включена двухфакторная аутентификация, используйте Personal Access Token вместо пароля.

---

## Вариант 2: Клонирование через SSH (рекомендуется, если настроен SSH ключ)

### Шаг 1: Настройка SSH ключа для GitHub (если еще не настроен)

```bash
# Сгенерируйте SSH ключ для GitHub (если еще нет)
ssh-keygen -t rsa -b 4096 -C "your-email@example.com" -f ~/.ssh/github_key

# Покажите публичный ключ
cat ~/.ssh/github_key.pub
```

Скопируйте публичный ключ и добавьте в GitHub:
1. Перейдите: `Settings → SSH and GPG keys → New SSH key`
2. Вставьте публичный ключ
3. Сохраните

### Шаг 2: Клонирование через SSH

```bash
# Перейдите в директорию
cd /var/www

# Удалите пустую папку yana_app (если она пустая)
rmdir yana_app 2>/dev/null || true

# Клонируйте репозиторий через SSH
git clone git@github.com:ваш-username/ваш-репозиторий.git yana_app

# Перейдите в папку проекта
cd yana_app
```

---

## Вариант 3: Клонирование с указанием ветки

Если нужно клонировать конкретную ветку (например, `main`):

```bash
cd /var/www
rmdir yana_app 2>/dev/null || true
git clone -b main https://github.com/ваш-username/ваш-репозиторий.git yana_app
cd yana_app
```

---

## Проверка после клонирования

```bash
# Проверьте, что файлы склонировались
ls -la

# Проверьте текущую ветку
git branch

# Проверьте удаленный репозиторий
git remote -v
```

---

## Настройка прав доступа

```bash
# Убедитесь, что у вас есть права на папку
sudo chown -R $USER:$USER /var/www/yana_app

# Или если используете веб-сервер (nginx/apache):
# sudo chown -R $USER:www-data /var/www/yana_app
# sudo chmod -R 755 /var/www/yana_app
```

---

## Если репозиторий приватный

### Для HTTPS:
GitHub попросит логин и пароль. Если включена 2FA, используйте **Personal Access Token**:
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Создайте новый токен с правами `repo`
3. Используйте токен вместо пароля

### Для SSH:
Просто добавьте публичный ключ в GitHub (см. Вариант 2 выше).

---

## Полный пример (HTTPS)

```bash
# 1. Перейти в директорию
cd /var/www

# 2. Удалить пустую папку (если есть)
rmdir yana_app 2>/dev/null || true

# 3. Клонировать репозиторий
git clone https://github.com/ваш-username/ваш-репозиторий.git yana_app

# 4. Перейти в папку
cd yana_app

# 5. Проверить содержимое
ls -la

# 6. Настроить права (если нужно)
sudo chown -R $USER:$USER /var/www/yana_app
```

---

## Решение проблем

### Проблема: "Permission denied (publickey)"

**Решение**: Настройте SSH ключ для GitHub (см. Вариант 2) или используйте HTTPS.

### Проблема: "Repository not found"

**Решение**: 
- Проверьте правильность URL репозитория
- Убедитесь, что репозиторий существует и доступен
- Для приватного репозитория настройте доступ (SSH ключ или Personal Access Token)

### Проблема: "fatal: destination path 'yana_app' already exists"

**Решение**:
```bash
# Удалите существующую папку
rm -rf /var/www/yana_app

# Или переименуйте
mv /var/www/yana_app /var/www/yana_app_backup

# Затем клонируйте заново
```

---

**После клонирования переходите к следующему шагу: установка зависимостей и сборка проекта.**
