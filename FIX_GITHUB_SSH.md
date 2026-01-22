# Исправление ошибки SSH для GitHub

## Проблема: "Permission denied (publickey)"

Это означает, что SSH ключ не настроен для GitHub или не добавлен в ваш GitHub аккаунт.

---

## Решение: Настройка SSH ключа для GitHub

### Шаг 1: Проверьте, есть ли уже SSH ключ

```bash
# Проверьте существующие ключи
ls -la ~/.ssh/
```

Если видите файлы `id_rsa` и `id_rsa.pub` или `id_ed25519` и `id_ed25519.pub`, можете использовать их.

### Шаг 2: Сгенерируйте SSH ключ (если нет)

```bash
# Генерация нового SSH ключа для GitHub
ssh-keygen -t ed25519 -C "your-email@example.com" -f ~/.ssh/github_key

# Когда спросит пароль (passphrase), можете:
# - Нажать Enter (без пароля) - проще
# - Или ввести пароль - более безопасно
```

### Шаг 3: Добавьте ключ в ssh-agent

```bash
# Запустите ssh-agent
eval "$(ssh-agent -s)"

# Добавьте ключ
ssh-add ~/.ssh/github_key
# Или если использовали стандартное имя:
# ssh-add ~/.ssh/id_ed25519
```

### Шаг 4: Скопируйте публичный ключ

```bash
# Покажите публичный ключ
cat ~/.ssh/github_key.pub
# Или если использовали стандартное имя:
# cat ~/.ssh/id_ed25519.pub
```

Скопируйте весь вывод (начинается с `ssh-ed25519` или `ssh-rsa`).

### Шаг 5: Добавьте ключ в GitHub

1. Перейдите на GitHub: https://github.com/settings/keys
2. Нажмите "New SSH key"
3. Заполните:
   - **Title**: например, "VPS Server" или "Beget VPS"
   - **Key**: вставьте скопированный публичный ключ
4. Нажмите "Add SSH key"

### Шаг 6: Проверьте подключение

```bash
# Проверьте подключение к GitHub
ssh -T git@github.com
```

Должно вывести что-то вроде:
```
Hi your-username! You've successfully authenticated, but GitHub does not provide shell access.
```

### Шаг 7: Клонируйте репозиторий

```bash
cd /var/www/yana_app
git clone git@github.com:landing100500/yana_app.git .
```

---

## Альтернатива: Использовать HTTPS (проще, но требует логин)

Если не хотите настраивать SSH, используйте HTTPS:

```bash
cd /var/www/yana_app
git clone https://github.com/landing100500/yana_app.git .
```

GitHub попросит логин и пароль. Если включена 2FA, используйте **Personal Access Token** вместо пароля.

---

## Полный список команд (для копирования)

Выполните на сервере последовательно:

```bash
# 1. Генерация SSH ключа
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_key -N ""

# 2. Запуск ssh-agent и добавление ключа
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/github_key

# 3. Показать публичный ключ (скопируйте его)
echo "=== ПУБЛИЧНЫЙ КЛЮЧ (скопируйте ниже) ==="
cat ~/.ssh/github_key.pub
echo "=== КОНЕЦ ==="

# 4. После добавления ключа в GitHub, проверьте подключение
ssh -T git@github.com

# 5. Если проверка прошла успешно, клонируйте репозиторий
cd /var/www/yana_app
git clone git@github.com:landing100500/yana_app.git .
```

---

## Решение проблем

### Проблема: "Could not open a connection to your authentication agent"

**Решение:**
```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/github_key
```

### Проблема: "Permission denied" после добавления ключа

**Решение:**
1. Убедитесь, что скопировали **публичный** ключ (с расширением `.pub`)
2. Проверьте, что ключ добавлен в правильный GitHub аккаунт
3. Попробуйте переподключиться:
   ```bash
   ssh -T git@github.com
   ```

### Проблема: Ключ не работает

**Решение:**
1. Проверьте права доступа:
   ```bash
   chmod 600 ~/.ssh/github_key
   chmod 644 ~/.ssh/github_key.pub
   ```
2. Убедитесь, что используете правильный ключ:
   ```bash
   ssh-add -l  # Показать добавленные ключи
   ```

---

## Быстрый вариант: HTTPS

Если не хотите возиться с SSH, просто используйте HTTPS:

```bash
cd /var/www/yana_app
git clone https://github.com/landing100500/yana_app.git .
```

При запросе логина/пароля:
- Логин: ваш GitHub username
- Пароль: Personal Access Token (если включена 2FA)

Создать токен: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token → выберите `repo` → Generate

---

**После настройки SSH ключа или использования HTTPS, репозиторий должен успешно клонироваться.**
