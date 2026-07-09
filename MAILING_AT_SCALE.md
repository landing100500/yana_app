# Масштабирование рассылок (1k–10k+ получателей)

Документ для переноса в другие проекты. Описывает архитектуру очереди, внесённые изменения, настройку cron и антиспам-практики.

---

## 1. Принцип: нет «одного большого HTTP»

**Плохо:** один запрос шлёт 10 000 писем → timeout nginx/Node, падение PM2, дубли при retry.

**Хорошо:** очередь в БД + cron каждые 2 минуты обрабатывает **чанки**.

```
Админ «Отправить»
  → status = sending, total_recipients = N
  → фон: 45 сек чанков (быстрый старт)
  → cron каждые 2 мин: добивает остаток

Cron POST /api/cron/mail-queue
  → activateScheduledBroadcasts()   // draft + scheduledAt ≤ now → sending
  → processSendingBroadcasts(budget)
  → processDueEnrollmentsCron(budget)
```

---

## 2. Статусы кампании (broadcast)

| Статус | Значение |
|--------|----------|
| `draft` | Черновик, можно редактировать |
| `sending` | В очереди, идёт отправка |
| `sent` | Все получатели обработаны, ошибок нет |
| `partial` | Большинство ушло, часть `failed` в логах |
| `failed` | Ни одного успешного |

Прогресс: `broadcast_logs` (status `sent` / `failed`), не in-memory.

**Уникальный индекс** `(campaign_id, user_id)` — защита от двойной отправки при параллельном cron.

---

## 3. Цепочки (sequences)

| Поле | Роль |
|------|------|
| `user_sequence_progress.next_send_at` | Когда слать следующий шаг |
| `message_sequences.launched_at` | Цепочка запущена (без этого cron не шлёт) |

- **Bulk launch на 10k:** только enroll в БД, **без** синхронной отправки в HTTP.
- **Cron** разбирает due enrollments чанками.
- Шаг с `delayMinutes = 0` уходит в ближайший проход cron (или при ручном старте 1 пользователя).

---

## 4. Переменные окружения (.env)

```env
CRON_SECRET=длинный_секрет
NEXT_PUBLIC_APP_URL=https://your-domain.com

# Очередь (дефолты под 1k–10k)
MAIL_QUEUE_LIMIT=100              # операций за 1 вызов cron
MAIL_BROADCAST_CHUNK_SIZE=30      # писем за проход по одной кампании
MAIL_SEQUENCE_CHUNK_SIZE=30       # шагов цепочек за проход
MAIL_SEQUENCE_DELAY_MS=500        # пауза между шагами цепочки
MAIL_BROADCAST_BUDGET_RATIO=0.6   # доля лимита на рассылки (остальное — цепочки)
MAIL_BACKGROUND_RUN_SECONDS=45      # фон после клика «Отправить» в админке
```

### Рекомендации по масштабу

| Получателей | delayMs в кампании | MAIL_QUEUE_LIMIT | MAIL_BROADCAST_CHUNK_SIZE | Cron |
|-------------|-------------------|------------------|---------------------------|------|
| до 500 | 1000 ms | 80 | 25 | */2 min |
| 500–2000 | 1500–2000 ms | 100 | 30 | */2 min |
| 2000–10000 | 2000–3000 ms | 150 | 40 | */2 min |
| 10000+ | 3000 ms + отдельный SMTP | 200 | 50 | */1 min* |

\* При 10k+ рассмотреть отдельный SMTP (SendGrid, Mailgun, Amazon SES) и cron каждую минуту.

---

## 5. Crontab на сервере

```bash
chmod +x /var/www/ACADEMY/scripts/cron-call.sh

crontab -e
```

```
*/2 * * * * /var/www/ACADEMY/scripts/cron-call.sh mail-queue >> /var/log/academy-cron.log 2>&1
```

Проверка:

```bash
./scripts/cron-call.sh mail-queue
crontab -l
tail -f /var/log/academy-cron.log
```

После перезагрузки VPS cron **сохраняется** (если добавлен через `crontab -e`).

---

## 6. Миграции БД

```bash
npm run db:migrate
```

Файлы:

- `add-sequence-cron-fields.sql` — `next_send_at`, `launched_at`, `launch_list_id`
- `add-broadcast-queue-fields.sql` — `total_recipients`, unique `(campaign_id, user_id)`

---

## 7. Математика времени (пример)

**Email broadcast 5000 человек, delay 2 сек, chunk 30, cron */2, budget 60% от 100 = 60 писем/2 мин**

- Фон после клика (~45 сек): ~15–20 писем
- Cron: ~60 писем / 2 мин = 30/мин
- 5000 / 30 ≈ **167 мин (~2.8 ч)**

**Ускорить:** уменьшить delay (осторожно со спамом), увеличить `MAIL_QUEUE_LIMIT` и `MAIL_BROADCAST_CHUNK_SIZE`, cron */1 min.

**Цепочка 3000 enrollments, шаг delay=0**

- 30 шагов / 2 мин → 1500/час → **~2 ч** на первый шаг всем.

---

## 8. Антиспам и доставляемость (обязательно на 1k+)

### Email

1. **Задержка между письмами:** минимум **1–2 сек** на shared SMTP (Beget). На 10k — **2–3 сек**.
2. **Прогрев домена:** новый домен — начать с 50–100/день, неделю наращивать.
3. **SPF, DKIM, DMARC** на домене отправителя.
4. **From** = реальный домен (`noreply@yourdomain.com`), не gmail.
5. **Unsubscribe** — ссылка отписки в футере (для маркетинга обязательна).
6. **Контент:** баланс текст/HTML, без спам-слов, нормальная тема.
7. **Сегментация:** списки вместо «всем подряд» — меньше жалоб.
8. **Bounce handling:** при переходе на SES/SendGrid — webhook на hard bounce → помечать email недействительным.
9. **Лимит Beget SMTP:** ~100–300 писем/час (уточнить у хостера). На 10k — **внешний SMTP**.

### Telegram

1. Задержка **0.5–1 сек** между сообщениями в рассылке.
2. Лимит Telegram ~30 msg/s глобально; в один чат — ~1/сек.
3. Картинки — **Buffer с диска**, не URL (сервер не отдаёт / Telegram не тянет).
4. Кнопки — только `https://`, валидная страница (иначе `wrong type of the web page content`).
5. HTML caption — fallback без кнопки/без parse_mode при ошибке.

### Общее

- Не слать ночью массово без необходимости (для email).
- Тест на себе + список из 5–10 адресов перед большой рассылкой.
- Мониторить `broadcast_logs` со status `failed`.

---

## 9. Ключевые файлы (этот проект)

| Файл | Назначение |
|------|------------|
| `lib/mail-queue-config.ts` | Лимиты из env |
| `lib/broadcast-send.ts` | `startBroadcast`, `processBroadcastChunk`, прогресс из БД |
| `lib/broadcast-recipients.ts` | Аудитория, дедуп email |
| `lib/mail-cron-runner.ts` | `processMailQueue` |
| `lib/sequence-scheduler.ts` | `nextSendAt`, cron enrollments |
| `app/api/cron/mail-queue/route.ts` | POST cron endpoint |
| `scripts/cron-call.sh` | Вызов с сервера |

---

## 10. Чеклист перед большой рассылкой

- [ ] `CRON_SECRET` в `.env` на сервере
- [ ] `crontab -l` показывает задачу */2 min
- [ ] `npm run db:migrate` выполнен
- [ ] Ручной `./scripts/cron-call.sh mail-queue` → `{"ok":true}`
- [ ] Тест на 1–5 получателей (список)
- [ ] delay ≥ 1.5 сек для email
- [ ] Счётчик получателей в админке совпадает с ожиданием
- [ ] SPF/DKIM настроены (email)
- [ ] После «Отправить» статус `sending` → через время `sent`/`partial`

---

## 11. Что ещё можно добавить (следующий этап)

Не реализовано, но рекомендуется для 10k+ в продакшене:

1. **Отписка (unsubscribe)** — таблица + ссылка в письме + проверка перед send.
2. **Retry failed** — повтор только для `failed` до 3 раз с backoff.
3. **Dedicated email provider** (SES, SendGrid) вместо shared SMTP.
4. **Redis/BullMQ** вместо cron+MySQL (если >50k или несколько воркеров).
5. **Пауза кампании** — status `paused` для экстренной остановки.
6. **Мониторинг** — алерт если `sending` > 24ч или failed > 10%.
7. **Rate limit по домену** — не более X писем/час на кампанию.

---

## 12. Деплой после обновления

```bash
# локально
git add -A && git commit -m "feat: очередь рассылок 1k-10k" && git push

# сервер
cd /var/www/ACADEMY
git pull
npm run db:migrate
npm run build
pm2 restart n8n-vibecode
./scripts/cron-call.sh mail-queue
```

---

*Версия документа: 2026-07-09. Проект: N8N-VIBECODE / academy.kl-dev.com*
