# Исправление ошибки "Permission denied (publickey)"

## Проблема: SSH ключ не используется

Нужно добавить ключ в ssh-agent и проверить конфигурацию.

---

## Решение: Настройка ssh-agent

### Шаг 1: Запустите ssh-agent и добавьте ключ

```bash
# Запустите ssh-agent
eval "$(ssh-agent -s)"

# Добавьте ключ в ssh-agent
ssh-add ~/.ssh/github_deploy

# Проверьте, что ключ добавлен
ssh-add -l
```

Должно показать что-то вроде:
```
4096 SHA256:... /root/.ssh/github_deploy (RSA)
```

### Шаг 2: Проверьте подключение с явным указанием ключа

```bash
# Попробуйте подключиться с указанием ключа
ssh -T -i ~/.ssh/github_deploy git@github.com
```

### Шаг 3: Если всё еще не работает - проверьте публичный ключ

```bash
# Покажите публичный ключ еще раз
cat ~/.ssh/github_deploy.pub
```

Убедитесь, что:
- Это **одна строка** (не несколько)
- Начинается с `ssh-rsa` или `ssh-ed25519`
- **НЕ** содержит `BEGIN` или `END`

### Шаг 4: Проверьте, что ключ добавлен в GitHub правильно

1. Перейдите: https://github.com/settings/keys
2. Убедитесь, что ключ там есть
3. Убедитесь, что это **публичный** ключ (одна строка)
4. Если есть старый неправильный ключ - удалите его

### Шаг 5: Создайте SSH config файл (рекомендуется)

```bash
# Создайте или отредактируйте SSH config
nano ~/.ssh/config
```

Добавьте следующее:

```
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/github_deploy
    IdentitiesOnly yes
```

Сохраните (Ctrl+O, Enter, Ctrl+X).

### Шаг 6: Проверьте подключение снова

```bash
# Проверьте подключение
ssh -T git@github.com
```

---

## Альтернатива: Использовать HTTPS (быстрое решение)

Если SSH всё еще не работает, используйте HTTPS:

```bash
cd /var/www/yana_app
git clone https://github.com/landing100500/yana_app.git .
```

GitHub попросит логин и пароль. Если включена 2FA, используйте Personal Access Token.

---

## Полный список команд для исправления

```bash
# 1. Запустить ssh-agent и добавить ключ
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/github_deploy

# 2. Проверить, что ключ добавлен
ssh-add -l

# 3. Создать SSH config
cat > ~/.ssh/config << 'EOF'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/github_deploy
    IdentitiesOnly yes
EOF

# 4. Установить правильные права
chmod 600 ~/.ssh/config
chmod 600 ~/.ssh/github_deploy

# 5. Проверить подключение
ssh -T git@github.com
```

---

## Если всё еще не работает

1. **Проверьте публичный ключ в GitHub:**
   - Перейдите: https://github.com/settings/keys
   - Убедитесь, что ключ там есть и это публичный ключ (одна строка)

2. **Проверьте содержимое публичного ключа:**
   ```bash
   cat ~/.ssh/github_deploy.pub
   ```
   Должна быть одна строка, начинается с `ssh-rsa` или `ssh-ed25519`

3. **Попробуйте пересоздать ключ:**
   ```bash
   # Удалите старый ключ
   rm ~/.ssh/github_deploy ~/.ssh/github_deploy.pub
   
   # Создайте новый
   ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy -N ""
   
   # Покажите публичный ключ
   cat ~/.ssh/github_deploy.pub
   ```
   Затем добавьте новый публичный ключ в GitHub.
