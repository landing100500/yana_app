# Генерация SSH ключа на сервере

## Шаг 1: Подключитесь к серверу

```bash
ssh user@your-vps-ip
# Введите пароль
```

---

## Шаг 2: Генерация SSH ключа на сервере

```bash
# Перейдите в домашнюю директорию
cd ~

# Создайте директорию .ssh, если её нет
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Генерируйте SSH ключ
ssh-keygen -t rsa -b 4096 -C "github-deploy-yana-app" -f ~/.ssh/github_deploy

# Когда спросит пароль (passphrase), можете:
# - Нажать Enter (без пароля) - проще для автоматизации
# - Или ввести пароль - более безопасно
```

После выполнения у вас будет:
- **Приватный ключ**: `~/.ssh/github_deploy`
- **Публичный ключ**: `~/.ssh/github_deploy.pub`

---

## Шаг 3: Добавление публичного ключа в authorized_keys

```bash
# Добавить публичный ключ в authorized_keys
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys

# Установить правильные права доступа
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

---

## Шаг 4: Копирование приватного ключа

Теперь нужно скопировать **приватный ключ** с сервера, чтобы добавить его в GitHub Secrets.

### Вариант A: Через cat (простой способ)

```bash
# На сервере выполните:
cat ~/.ssh/github_deploy
```

Скопируйте весь вывод (включая строки `-----BEGIN OPENSSH PRIVATE KEY-----` и `-----END OPENSSH PRIVATE KEY-----`).

### Вариант B: Через scp (если нужно скачать файл)

На вашем локальном компьютере:

```bash
# Скачать приватный ключ с сервера
scp user@your-vps-ip:~/.ssh/github_deploy ~/Downloads/github_deploy_key

# Затем открыть файл и скопировать содержимое
cat ~/Downloads/github_deploy
# Или в Windows:
# notepad ~/Downloads/github_deploy
```

⚠️ **Важно**: После копирования удалите файл с локального компьютера для безопасности:
```bash
rm ~/Downloads/github_deploy
```

---

## Шаг 5: Добавление приватного ключа в GitHub Secrets

1. Перейдите в GitHub: `Settings → Secrets and variables → Actions`

2. Создайте новый секрет:
   - **Name**: `VPS_SSH_KEY`
   - **Value**: Вставьте весь текст приватного ключа (который скопировали на шаге 4)

3. Также добавьте другие секреты:
   - `VPS_HOST` - IP или домен вашего сервера
   - `VPS_USER` - ваш пользователь (root, beget и т.д.)
   - `VPS_DEPLOY_PATH` (опционально) - `/var/www/yana_app`

---

## Шаг 6: Проверка подключения

На вашем локальном компьютере попробуйте подключиться:

```bash
# Скачайте приватный ключ временно
scp user@your-vps-ip:~/.ssh/github_deploy ~/temp_key
chmod 600 ~/temp_key

# Попробуйте подключиться
ssh -i ~/temp_key user@your-vps-ip

# Если подключилось без пароля - всё работает!
# Удалите временный файл
rm ~/temp_key
```

Или проще - просто попробуйте подключиться обычным способом:
```bash
ssh user@your-vps-ip
# Теперь не должно спрашивать пароль
```

---

## Шаг 7: Очистка (опционально, но рекомендуется)

После того, как всё настроено и работает, можно удалить приватный ключ с сервера (он уже в GitHub Secrets):

```bash
# На сервере
rm ~/.ssh/github_deploy
```

Публичный ключ (`github_deploy.pub`) можно оставить или тоже удалить - он уже в `authorized_keys`.

---

## Полный список команд (для копирования)

Выполните на сервере последовательно:

```bash
# 1. Создать директорию и сгенерировать ключ
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t rsa -b 4096 -C "github-deploy-yana-app" -f ~/.ssh/github_deploy -N ""

# 2. Добавить публичный ключ в authorized_keys
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# 3. Показать приватный ключ для копирования
echo "=== ПРИВАТНЫЙ КЛЮЧ (скопируйте весь текст ниже) ==="
cat ~/.ssh/github_deploy
echo "=== КОНЕЦ ПРИВАТНОГО КЛЮЧА ==="

# 4. Показать публичный ключ (для справки)
echo "=== ПУБЛИЧНЫЙ КЛЮЧ ==="
cat ~/.ssh/github_deploy.pub
```

---

## Решение проблем

### Проблема: "Permission denied (publickey)"

**Решение:**
```bash
# Проверьте права доступа
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/github_deploy

# Проверьте содержимое authorized_keys
cat ~/.ssh/authorized_keys
```

### Проблема: SSH сервер не разрешает ключи

**Решение:**
```bash
# Проверьте конфигурацию SSH
sudo nano /etc/ssh/sshd_config

# Убедитесь, что есть:
# PubkeyAuthentication yes
# AuthorizedKeysFile .ssh/authorized_keys

# Перезапустите SSH
sudo systemctl restart sshd
```

---

## Безопасность

✅ **Рекомендации:**
- После копирования приватного ключа в GitHub Secrets, удалите его с сервера
- Не храните приватные ключи в открытом доступе
- Используйте пароль для ключа (passphrase), если это возможно
- Регулярно проверяйте, кто имеет доступ к серверу

---

**Готово!** Теперь GitHub Actions сможет подключаться к серверу по SSH ключу.
