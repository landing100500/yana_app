# Поиск или генерация SSH ключа для GitHub

## Шаг 1: Проверьте, какие ключи уже есть

```bash
# Посмотрите все файлы в .ssh
ls -la ~/.ssh/
```

Если видите файлы типа:
- `id_rsa` и `id_rsa.pub`
- `id_ed25519` и `id_ed25519.pub`
- `github_deploy` и `github_deploy.pub`

То используйте существующий `.pub` файл.

---

## Шаг 2: Если ключей нет - сгенерируйте новый

```bash
# Сгенерируйте новый SSH ключ для GitHub
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_key -N ""

# Когда спросит "Enter file in which to save the key", нажмите Enter
# Когда спросит пароль (passphrase), нажмите Enter (без пароля)
```

---

## Шаг 3: Покажите публичный ключ

```bash
# Покажите публичный ключ
cat ~/.ssh/github_key.pub
```

Скопируйте весь вывод (одна строка, начинается с `ssh-ed25519`).

---

## Шаг 4: Добавьте в GitHub

1. Перейдите: https://github.com/settings/keys
2. Удалите старый неправильный ключ (если еще не удалили)
3. Нажмите "New SSH key"
4. Title: "VPS Server"
5. Key: вставьте скопированный публичный ключ
6. Нажмите "Add SSH key"

---

## Шаг 5: Проверьте подключение

```bash
# Проверьте подключение к GitHub
ssh -T git@github.com
```

Должно вывести: `Hi landing100500! You've successfully authenticated...`

---

## Шаг 6: Клонируйте репозиторий

```bash
cd /var/www/yana_app
git clone git@github.com:landing100500/yana_app.git .
```

---

## Полный список команд (для копирования)

```bash
# 1. Проверить существующие ключи
ls -la ~/.ssh/

# 2. Если ключей нет, сгенерировать новый
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_key -N ""

# 3. Показать публичный ключ
cat ~/.ssh/github_key.pub

# 4. Добавить ключ в ssh-agent (опционально, но рекомендуется)
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/github_key

# 5. Проверить подключение
ssh -T git@github.com

# 6. Клонировать репозиторий
cd /var/www/yana_app
git clone git@github.com:landing100500/yana_app.git .
```
