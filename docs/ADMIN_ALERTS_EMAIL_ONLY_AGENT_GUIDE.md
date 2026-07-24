# Задача: админ-алерты об ошибках на email (SMTP), без Telegram

Инструкция для AI-агента в **другом** Next.js-проекте на Beget с SMTP.  
Цель — такая же обработка ошибок с уведомлениями на email, как в ACADEMY, но **без Telegram-бота**.

---

## Контекст

Стек: **Next.js (App Router) на Beget VPS**, почта через **SMTP / nodemailer** (как уже настроено в проекте).

Нужна схема оповещений админа: все уровни (`critical` / `high` / `medium` / `low`) уходят **только на email**.

Не подключай бота, не добавляй `TELEGRAM_*`.

---

## Цель

1. Модуль `lib/admin-alerts.ts` (или аналог).
2. Env `ADMIN_ALERTS_EMAIL`.
3. Вызовы в критичных местах (auth, cron, SMTP-сбои, 500, платежные точки).
4. Тестовый endpoint для проверки.
5. Дедуп, чтобы не заспамить ящик при retry-лупах.

---

## Env

```env
ADMIN_ALERTS_EMAIL=admin@example.com

# уже должны быть:
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_FROM_NAME=
NEXT_PUBLIC_APP_URL=https://ваш-домен.ru
```

На Beget — в `.env.local` / `.env` приложения **и** убедись, что PM2 их подхватывает (часто через `env_file` / `dotenv` при старте).

---

## API модуля

```ts
type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

type AlertOptions = {
  source: string;          // 'cron/mail-queue' | 'auth/signup' | ...
  severity: AlertSeverity;
  title: string;
  detail?: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
  error?: unknown;         // Error → message + stack (обрезать)
  dedupeMs?: number;       // default 5*60*1000; 0 = без дедупа
};

alertAdmin(opts): Promise<boolean>
alertAdminAsync(opts): void   // fire-and-forget, не блокирует ответ юзеру

getAdminAlertsEmail(): string
severityFromHttpStatus(status: number): AlertSeverity
// 5xx → high, 429 → medium, 4xx → low, else info
```

### Маршрутизация (email-only)

| severity | канал |
|----------|--------|
| `critical` | **email** |
| `high` / `medium` / `low` | **email** |
| `info` | не слать |

В референсе ACADEMY `critical` шёл в Telegram — **здесь critical тоже на email**.

### Письмо

- Subject: `[CRITICAL] ...` / `[HIGH] ...`
- HTML + text
- Поля: severity, title, source, `NEXT_PUBLIC_APP_URL`, ISO time, detail, meta-таблица, stack ошибки (`<pre>`)
- From: существующий SMTP `from` / `fromName`
- To: `ADMIN_ALERTS_EMAIL`
- Использовать уже существующий `createTransporter()` / nodemailer из проекта

### Дедуп

In-memory `Map<source:severity:title:detail, timestamp>`.  
Если тот же ключ пришёл раньше чем `dedupeMs` — skip.  
Очищать старые ключи при size > ~200.

Для тестов и разовых критичных событий: `dedupeMs: 0`.

### Нельзя

- Бросать из `alertAdminAsync` наружу (только `console.error`)
- Ждать алерт в happy-path пользователя, если можно async
- Слать алерт на каждую ожидаемую 401/400 (логин с кривым паролем и т.п.)

---

## Куда встраивать (минимум)

Ищи аналоги в целевом проекте и вешай `alertAdminAsync`:

1. **Cron / фоновые job** — падение обработки → `critical`
2. **SMTP не отправил** важное письмо (активация, сброс пароля) → `high`
3. **Конфиг сломан** (нет `CRON_SECRET`, нет SMTP при попытке send) → `high`, длинный `dedupeMs` (1ч)
4. **Непойманные 500** в ключевых API (оплата, auth, webhooks) → `high` / `critical`
5. **Оплата failed/success** (если есть) — хелперы `alertPaymentFailed` / `alertPaymentSuccess`

Пример:

```ts
try {
  // ...
} catch (e) {
  console.error('Mail queue cron error:', e);
  alertAdminAsync({
    source: 'cron/mail-queue',
    severity: 'critical',
    title: 'Cron mail-queue: падение',
    error: e,
  });
  return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
}
```

SMTP fail при signup:

```ts
alertAdminAsync({
  source: 'auth/signup',
  severity: 'high',
  title: 'Регистрация: SMTP не отправил письмо активации',
  detail: 'Пользователь не получит ссылку — проверьте SMTP',
  meta: { email: userEmail },
  error: smtpErr,
});
```

---

## Тест endpoint

`POST /api/admin/alerts/test` (только для залогиненного админа):

```json
{ "severity": "critical", "title": "Тест critical" }
{ "severity": "high", "title": "Тест high" }
```

Ответ: `{ ok, email, severity }`.  
Проверь, что письмо реально пришло на `ADMIN_ALERTS_EMAIL`.

---

## Severity — когда что

- **critical** — сервис лежит / cron падает / БД недоступна / платёжный webhook сломан
- **high** — юзер не получил важное письмо, 5xx в критичном API, битый секрет
- **medium** — деградация, rate limit, успешная оплата (если нужно знать)
- **low** — подозрительные, но не срочные 4xx
- **info** — не слать (логи / дайджесты отдельно, если понадобятся)

---

## Реализация — чеклист для агента

1. Изучи существующий SMTP (`lib/email.ts` или аналог) — переиспользуй transporter.
2. Добавь `lib/admin-alerts.ts` по спеке выше (**email-only, включая critical**).
3. Добавь `ADMIN_ALERTS_EMAIL` в `.env.example` и прод `.env`.
4. Встрой вызовы в cron / auth / SMTP fail / ключевые catch.
5. Добавь admin test route.
6. На Beget: `npm run build` → `pm2 restart` → дерни test → проверь почту (и спам).
7. Не коммить секреты. Не трогай Telegram.

---

## Готовый скелет `alertAdmin` (логика)

```ts
export async function alertAdmin(opts: AlertOptions): Promise<boolean> {
  if (opts.severity === 'info') return false;

  const dedupeMs = opts.dedupeMs ?? 5 * 60 * 1000;
  const key = `${opts.source}:${opts.severity}:${opts.title}:${opts.detail || ''}`;
  if (shouldSkipDedupe(key, dedupeMs)) return false;

  // ВАЖНО: в отличие от референса ACADEMY — ВСЁ на email, включая critical
  return sendEmailAlert(opts);
}

export function alertAdminAsync(opts: AlertOptions): void {
  alertAdmin(opts).catch((e) => console.error('[admin-alerts] async:', e));
}
```

Если SMTP самого алерта упал — только `console.error`, без рекурсии алертов на тот же SMTP.

---

## Definition of done

- [ ] Письмо на `critical` приходит на почту
- [ ] Письмо на `high` приходит
- [ ] Повтор того же алерта в течение 5 мин не дублируется
- [ ] С `dedupeMs: 0` тест шлётся каждый раз
- [ ] Ошибка в бизнес-коде не ломается, если алерт не ушёл
- [ ] Telegram нигде не фигурирует
