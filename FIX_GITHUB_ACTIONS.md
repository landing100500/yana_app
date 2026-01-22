# Исправление ошибок GitHub Actions

## Проблема: Build падает с exit code 1

### Возможные причины:

1. **Ошибки линтера** - но у нас `continue-on-error: true`, так что это не должно останавливать
2. **Ошибки сборки** - отсутствие переменных окружения или ошибки в коде
3. **Ошибки TypeScript** - проблемы с типами

### Решение 1: Добавить переменные окружения в GitHub Secrets

Если сборка требует переменные окружения, добавьте их в GitHub:

1. Перейдите в репозиторий → **Settings** → **Secrets and variables** → **Actions**
2. Добавьте необходимые переменные:
   - `NEXT_PUBLIC_SUPABASE_URL` (если используется на этапе сборки)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (если используется на этапе сборки)
   - Другие переменные, которые требуются на этапе сборки

### Решение 2: Временно отключить проверки (для быстрого деплоя)

Если нужно срочно задеплоить, можно временно пропустить проверки:

```yaml
jobs:
  test:
    name: Run tests and checks
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Install dependencies
        run: npm ci
      # Временно пропускаем проверки
      - name: Skip checks (temporary)
        run: echo "Skipping checks for now"
```

### Решение 3: Проверить логи GitHub Actions

1. Откройте вкладку **Actions** в GitHub
2. Кликните на упавший workflow
3. Разверните шаг "Build project"
4. Посмотрите точную ошибку в логах

### Решение 4: Собрать локально для проверки

Проверьте, что сборка работает локально:

```bash
npm ci
npm run build
```

Если локально работает, а в GitHub нет - проблема в переменных окружения или в окружении GitHub Actions.

### Решение 5: Улучшить обработку ошибок в workflow

Workflow уже обновлен для более детального вывода ошибок. Проверьте последнюю версию `.github/workflows/deploy.yml`.

---

## Как посмотреть детальные логи ошибки

1. GitHub → **Actions** → выберите упавший workflow
2. Кликните на job "Run tests and checks"
3. Разверните шаг, который упал (обычно "Build project")
4. Скопируйте ошибку и проверьте, что именно не так

---

## Типичные ошибки и решения

### "Cannot find module" или "Module not found"
- **Причина**: Отсутствуют зависимости
- **Решение**: Проверьте `package.json` и `package-lock.json` закоммичены

### "Environment variable is missing"
- **Причина**: Переменная используется на этапе сборки
- **Решение**: Добавьте переменную в GitHub Secrets или используйте заглушку

### "Type error" или TypeScript ошибки
- **Причина**: Ошибки типов в коде
- **Решение**: Исправьте ошибки TypeScript локально, затем закоммитьте

### "Out of memory" или "Killed"
- **Причина**: Недостаточно памяти в GitHub Actions
- **Решение**: Увеличьте `NODE_OPTIONS='--max-old-space-size=6144'` в `package.json` build скрипте

---

## Быстрое решение (временно пропустить проверки)

Если нужно срочно задеплоить, можно временно изменить workflow:

```yaml
jobs:
  test:
    name: Run tests and checks
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Skip checks
        run: echo "Checks skipped"
```

Но лучше исправить проблему, чтобы не деплоить битый код.
