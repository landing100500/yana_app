# Дорожная карта продукта ЯСНА

Общий план развития приложения. Отдельные технические дорожные карты: [VPS_DEPLOY_ROADMAP.md](./VPS_DEPLOY_ROADMAP.md), [SMS_AUTH_ROADMAP.md](./SMS_AUTH_ROADMAP.md).

---

## Сделано

### Тарифы и оплата
- [x] Тарифы: Бесплатный, 24 часа, Оптимальный, Профессиональный
- [x] Страница `/tariffs` с оплатой через ЮKassa (redirect + webhook)
- [x] Активация тарифа после успешного платежа
- [x] Чеки 54-ФЗ в запросе создания платежа
- [x] Таймер сессии: 60 мин / 7 дней (free), 24 ч (тариф «24 часа»), безлимит (платные)

### Ограничения и сообщения
- [x] Блокировка чата при исчерпании времени
- [x] Текст Ясны с предложением тарифов и кликабельной ссылкой на `/tariffs`
- [x] Сообщение «Увидимся через 7 дней…» для бесплатного тарифа
- [x] Отдельное сообщение после 4 месяцев на free без оплат

### Юридическое и UI
- [x] Политика конфиденциальности, публичная оферта
- [x] Подвал с реквизитами ИП на публичных страницах
- [x] Поддержка телефонов +7 и +375 (валидация по длине цифр)

### Напоминания (базовая версия)
- [x] Библиотека из ~30 текстов напоминаний (`lib/reminder-messages.ts`)
- [x] API cron: `POST /api/cron/daily-reminders`
- [x] Сообщения в чате (тема «Напоминание от Ясны») для пользователей без успешных оплат

---

## В работе / ближайшее

### Тарифы
- [x] Вернули боевые цены тарифов ЮKassa (900 / 9900 / 49000 ₽)
- [ ] Уточнить `YOOKASSA_VAT_CODE` и `YOOKASSA_TAX_SYSTEM_CODE` с бухгалтером

### Авторизация
- [ ] SMS-авторизация через SMS.ru — см. [SMS_AUTH_ROADMAP.md](./SMS_AUTH_ROADMAP.md)

### Антиспам регистрации (без капчи)

**Сейчас:** только лимиты OTP по email (cooldown 60с, ≤5/час) и ≤5 попыток кода. Honeypot / IP rate limit **нет**.  
Точки входа: лендинг `app/page.tsx` → `POST /api/auth/phone`, также `/api/auth/reset`.

- [ ] **Honeypot** — скрытый input (`website` / аналог), который боты заполняют; в UI `display:none` / off-screen, `tabIndex=-1`, `autocomplete=off`, без label для людей
- [ ] **Сервер: поле должно быть пустым** — в `POST /api/auth/phone` (и reset) если honeypot непустой → `400`/`204` без создания юзера и без отправки OTP (тихо или с нейтральной ошибкой)
- [ ] **Timing / min form fill time** — на клиенте timestamp открытия формы; на сервере отклонять, если submit быстрее N мс (например 1500–3000), чтобы отсечь мгновенный bot POST
- [ ] **Rate limit по IP** — лимит запросов OTP с одного IP (через `lib/client-ip.ts`), отдельно от лимита по email; хранение: память процесса или таблица/Redis; ответ `429`
- [ ] (опционально позже) алерт админу при всплеске honeypot/IP rejects

**Не делать в этой задаче:** captcha / Turnstile / hCaptcha.

---

## На будущее

### Cron: ежедневные напоминания (продакшн)

**Сейчас:** endpoint есть, логика пишет сообщение в чат. Нужна стабильная автоматизация.

- [ ] Добавить `CRON_SECRET` в `.env.local` / продакшн-секреты
- [ ] Настроить вызов раз в сутки (cron на VPS или внешний scheduler, например cron-job.org):
  ```bash
  curl -X POST https://yasna.chat/api/cron/daily-reminders \
    -H "Authorization: Bearer <CRON_SECRET>"
  ```
- [ ] Логирование и алерт при ошибках (Telegram / email админу)
- [ ] Опционально: дублировать напоминание на email (`support@yasna.ru` / SMTP)
- [ ] Фильтры: не слать, если пользователь уже заходил сегодня / если недавно писал в чат
- [ ] A/B или ротация текстов по `reminderDayIndex` (уже заложено в БД)

### Push-уведомления

**Сейчас:** не реализовано. Напоминания только внутри чата при открытии приложения.

- [ ] Выбрать стек: Web Push (PWA) и/или нативные push (если появится мобильное приложение)
- [ ] Запрос разрешения у пользователя (`Notification.requestPermission`) — только после явного согласия в UI
- [ ] Service Worker + подписка (VAPID keys: `NEXT_PUBLIC_VAPID_KEY`, `VAPID_PRIVATE_KEY`)
- [ ] Таблица `push_subscriptions` (userId, endpoint, keys, createdAt)
- [ ] Отправка push из того же cron или отдельного `POST /api/cron/daily-reminders` с веткой push
- [ ] Тексты push короче, чем в чате; deep link на `/chat` или `/tariffs`
- [ ] Обработка отписки и истечения подписки
- [ ] Политика конфиденциальности: пункт про push-уведомления

### Продукт и аналитика
- [ ] Дашборд оплат и конверсии тарифов (админка)
- [ ] Автопродление подписок (рекуррентные платежи ЮKassa)
- [ ] Промокоды / скидки

### Инфраструктура
- [ ] CI/CD на VPS — см. [VPS_DEPLOY_ROADMAP.md](./VPS_DEPLOY_ROADMAP.md)
- [ ] Staging-окружение для теста платежей и cron

### БД: utf8mb4 (emoji / 4-byte Unicode в чате)

**Симптом (уже ловили алерт):**  
`[CRITICAL] Чат: необработанная ошибка (500)` · `source: chat/message` · `phase=topic`  
`Conversion from collation utf8mb4_unicode_ci into utf8mb3_general_ci impossible for parameter`

**Причина:** при создании темы (`ChatTopic.create`, title = первые 50 символов сообщения) или записи в `messages` — в тексте emoji/редкий Unicode, а таблица/колонка ещё **utf8mb3**. Соединение шлёт utf8mb4 → MySQL падает.

**Пока:** не чиним сразу — смотрим частоту алертов на `ADMIN_ALERTS_EMAIL` (дедуп ~10 мин, так что «1 письмо» ≠ «1 инцидент»).

- [ ] Наблюдать частоту алертов с текстом `utf8mb3` / `utf8mb4` / `phase=topic`
- [ ] Если повторяется часто — миграция:
  - `ALTER TABLE chat_topics CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  - `ALTER TABLE messages CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  - по желанию остальные текстовые таблицы чата (`user_memories`, `chat_topic_summaries`, …) и `ALTER DATABASE … utf8mb4`
  - в `lib/db.ts`: `dialectOptions.charset = 'utf8mb4'`, `define.charset/collate`
- [ ] Перед ALTER — бэкап; на Beget учитывать лок большой `messages`

---

