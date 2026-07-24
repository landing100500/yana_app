# Дорожная карта: email-рассылки ЯСНА (`yasna.chat`)

Документ для владельца продукта и агента: **что делать с доставляемостью**, SPF/DKIM/DMARC, репутацией и выбором ESP.  
Актуально после бана Beget `mail@yasna.chat` (много отказов iCloud `554 HM08` + bounce).

---

## 0. Короткий ответ на главные вопросы

### Всё ли зависит от репутации домена?

**Не только домена.** Репутация складывается из нескольких сигналов:

| Слой | Что это | Влияние |
|------|---------|---------|
| **Домен** (`yasna.chat`) | История жалоб, bounce rate, «новизна» для Gmail/Apple | Высокое |
| **IP отправителя** | Shared SMTP Beget = чужой «грязный» пул | Очень высокое на Beget |
| **Ящик / From** | `mail@…` vs транзакционный `otp@…` | Высокое |
| **Контент** | Ссылки, HTML, «продающий» тон, картинки | Среднее–высокое |
| **Список** | Холодная база, мёртвые адреса, iCloud/Gmail | Высокое |
| **Поведение** | Объём/день, всплески, повторные отказы | Высокое |
| **Аутентификация** | SPF + DKIM + DMARC | Обязательный фундамент (без них репутацию почти не построить) |

**Вывод:** валидация адресов — вспомогательная мера.  
На shared Beget SMTP при массовых рассылках ban почти неизбежен. Нормальный путь: **OTP на своём SMTP, маркетинг — на ESP с хорошей репутацией IP** (Unisender / Unisender Go / SES / аналог).

### Валидация — хорошее решение?

**Частично.**  
- Ловит опечатки, домены без MX, мусор.  
- **Не лечит** iCloud `554 local policy` на живых адресах (это политика/репутация).  
Платные validator’ы полезны **перед большой кампанией**, но не заменяют ESP.

---

## 1. IP отправителя: «свой IP» на Beget и другие варианты

### Как у тебя устроено сейчас

```
Приложение на VPS (IP вида 109.x.x.x)
        │
        │  SMTP AUTH на smtp.beget.com
        ▼
   Почтовая инфраструктура Beget (их shared IP пул)
        │
        ▼
   Gmail / iCloud / Yahoo   ← репутацию смотрят ЗДЕСЬ (IP Beget + домен)
```

**Выделенный IP VPS ≠ IP, с которого Apple/Gmail видят письмо**, пока ты шлёшь через `smtp.beget.com`.

---

### Вариант A — Выделенный IP VPS на Beget

**Что это:** отдельный публичный IP, привязанный к твоему VPS (сайт, SSH, nginx).  
**Зачем обычно берут:** белый IP сайта, SSL, иногда PTR/rDNS, изоляция от соседей по shared hosting.

**Что это НЕ делает для текущей схемы ЯСНА:**
- не меняет outbound IP писем через `smtp.beget.com`;
- не снимает бан ящика `mail@yasna.chat`;
- не даёт «чистую репутацию отправителя» для рассылок.

#### Как подключить на Beget (VPS)

1. Панель Beget → раздел **VPS / Облако** (или **Сеть / IP** у твоего сервера).
2. Заказать / добавить **дополнительный (выделенный) IPv4** к серверу `tjnaskcvcp` (или как назван VPS).
3. В ОС сервера прописать адрес (часто Beget даёт инструкцию netplan/ifcfg; на многих тарифах IP уже «висит» на интерфейсе после заказа).
4. Проверить:
   ```bash
   ip -4 addr
   curl -4 ifconfig.me
   ```
5. DNS сайта: A-запись `yasna.chat` / `www` → новый IP (если переезжаешь сайт на него).
6. **PTR (rDNS)** — только через тикет Beget (сам в DNS домена PTR не ставится):
   - тема: «Прошу установить PTR для IP …»;
   - указать IP и hostname, напр. `mail.yasna.chat` или `vps.yasna.chat`;
   - заранее A-запись hostname → этот же IP (иначе FCrDNS не сойдётся).
7. Проверка PTR:
   ```bash
   dig -x ТВОЙ_IP +short
   dig +short A mail.yasna.chat
   ```

**Когда имеет смысл для почты:** только если поднимаешь **свой** MTA на этом VPS (вариант B).  
**Для текущего nodemailer → smtp.beget.com:** почти бесполезно для deliverability рассылок. Можно взять для сайта/привычки, но **не как решение бана почты**.

> На shared-хостинге Beget «выделенный IP» в разделе «Сайты» нужен ещё для DKIM через `mail()`/sendmail. У нас отправка через SMTP API — другая схема; DKIM для SMTP Beget настраивается тикетом/панелью почты домена (см. [KB Beget DKIM](https://beget.com/ru/kb/how-to/mail/nastrojka-dkim)).

---

### Вариант B — Свой почтовый сервер на VPS (свой sending IP)

**Суть:** Postfix / Mailcow / Postal на VPS → письма уходят **с IP VPS**, не через `smtp.beget.com`.

| Шаг | Действие |
|-----|----------|
| 1 | Выделенный IP VPS + PTR → `mail.yasna.chat` |
| 2 | A: `mail.yasna.chat` → IP; MX (если приём тоже свой) |
| 3 | SPF: `ip4:ТВОЙ_IP` (+ убрать/ограничить чужие include при полном переносе) |
| 4 | DKIM на своём MTA + TXT селектор |
| 5 | DMARC как в фазе B |
| 6 | OpenDKIM, лимиты, очередь, мониторинг блеклистов |
| 7 | Прогрев IP неделями (десятки → сотни писем/день) |

**Минусы:** сам антиспам, блеклисты, жалобы, поддержка 24/7-класса.  
**Вердикт для ЯСНА:** **не рекомендуется** как основной путь маркетинга.

---

### Вариант C — ESP shared IP (рекомендуется)

Unisender / Unisender Go / SES / Brevo / Mailgun:

- письма уходят с **их** прогретых IP;
- bounce/complaint webhook;
- ты платишь за доставку, не за админство MTA.

Это и есть замена «чужому грязному shared Beget SMTP» без самодельного сервера.

---

### Вариант D — Dedicated IP у ESP

Отдельный IP **в кабинете ESP** (не Beget VPS).

- Обычно с порога объёма (десятки–сотни тысяч писем/мес) + прогрев.
- Репутация IP **полностью твоя**: один плохой blast — IP портишь сам.
- Имеет смысл **после** стабильного объёма на shared ESP.

---

### Сводка: что выбирать

| Цель | Решение |
|------|---------|
| Починить бан / массовые рассылки | **ESP** (C), не IP VPS |
| OTP / коды | Beget SMTP + `SMTP_OTP_*` |
| «Хочу свой IP для писем» | ESP dedicated (D) или свой MTA (B) |
| Выделенный IP VPS Beget (A) | Сайт / PTR / база для (B); **не чинит** `smtp.beget.com` |

```
Нужен свой sending-IP?
        │
        ├─ Нет, нужна доставляемость ──► Unisender Go / SES (C)
        │
        ├─ Да, и большой объём ──► Dedicated IP у ESP (D)
        │
        └─ Да, и полный контроль ──► VPS IP + PTR + свой MTA (A)+(B)
                                      (дорого по времени, риск)
```

---

## 2. Целевая архитектура (к чему идём)

```
┌─────────────────┐     SMTP_OTP_* (Beget)      ┌──────────────┐
│ Регистрация/OTP │ ──────────────────────────► │ otp@yasna…   │
│ Админ-алерты    │                              └──────────────┘
└─────────────────┘

┌─────────────────┐     API ESP (не Beget SMTP)  ┌──────────────┐
│ Рассылки/цепочки│ ──────────────────────────► │ Unisender /  │
│ mail_sends queue│   + webhook bounce/unsub     │ SES / Go     │
└─────────────────┘                              └──────────────┘
```

Правила:
1. **Транзакционные** письма (коды) — отдельный ящик, низкий объём, Beget ок.
2. **Маркетинг** — не гнать через shared Beget SMTP.
3. Очередь/админка/цепочки **остаются в ЯСНА**; меняется только транспорт `sendMarketingEmail`.
4. Капы (час/день) оставляем даже на ESP — как страховка от своих ошибок.

---

## 3. Фазы дорожной карты

### Фаза A — Стабилизация (сейчас, 1–3 дня)

**Цель:** OTP работает, маркетинг не убивает ящик снова.

- [x] Отдельный `SMTP_OTP_*` для кодов
- [x] Маркетинг на `SMTP_*` с капами `MAIL_HOURLY_SEND_CAP` / `MAIL_DAILY_SEND_CAP`
- [x] Circuit breaker только при `sending is disabled`
- [x] Suppress hard bounce / `554 local policy`
- [x] Pre-check синтаксис + MX (`MAIL_VALIDATE_MX`)
- [ ] Почистить bounce в веб-почте `mail@yasna.chat`
- [ ] `npx tsx scripts/suppress-from-bounces.ts` на VPS
- [ ] Дождаться разбана `mail@` **или** не слать маркетинг с него
- [ ] Проверить SPF/DKIM/DMARC (фаза B) — **до** любых новых массовых рассылок

**Не делать:** всю базу одним днём; cold blast на iCloud/Gmail с Beget.

---

### Фаза B — Аутентификация домена (обязательно, 0.5–1 день)

**Цель:** Gmail/Apple/Yahoo видят, что `yasna.chat` легитимно шлёт почту.

Без SPF+DKIM+DMARC ESP и крупные провайдеры будут резать чаще. Это не «магия репутации», а **пропуск в игру**.

#### B1. Кто сейчас шлёт почту?

| Канал | From | Через кого |
|-------|------|------------|
| OTP | `otp@…` / новый ящик | Beget SMTP |
| Маркетинг (пока) | `mail@yasna.chat` | Beget SMTP |
| Маркетинг (цель) | `mail@` или `news@` | Unisender / SES |

DNS настраивается **в панели, где лежат NS домена `yasna.chat`** (часто Beget DNS).

#### B2. Проверить текущее состояние

С VPS или локально:

```bash
# SPF
dig +short TXT yasna.chat | grep -i spf

# DMARC
dig +short TXT _dmarc.yasna.chat

# DKIM Beget (селектор часто beget / mail — уточнить в панели почты)
dig +short TXT beget._domainkey.yasna.chat
dig +short TXT mail._domainkey.yasna.chat
```

Онлайн:
- https://mxtoolbox.com/SuperTool.aspx (SPF / DKIM / DMARC)
- https://www.mail-tester.com — отправить тестовое письмо, цель **≥ 8/10**
- Google Postmaster Tools: https://postmaster.google.com (добавить `yasna.chat`)

#### B3. SPF (Beget)

Типичная запись (одна TXT на корень, **не две SPF**):

```txt
yasna.chat.  TXT  "v=spf1 include:beget.com ~all"
```

Если появятся Unisender / SES — **добавляют include в ту же строку**, например:

```txt
v=spf1 include:beget.com include:spf.unisender.com ~all
```

(точные `include:` — из кабинета ESP).

Правила:
- Только **одна** SPF-политика на домен.
- Начать с `~all` (softfail), после стабилизации можно `~all` оставить или ужесточить.
- Не ставить `+all`.

#### B4. DKIM (Beget)

1. Панель Beget → почта / домен → **DKIM** → включить.
2. Добавить выданную TXT-запись `*.*_domainkey.yasna.chat`.
3. Проверить `dig` / MxToolbox.

Для Unisender/SES — **отдельные** DKIM-записи селекторов ESP (они не заменяют Beget DKIM для писем с Beget).

#### B5. DMARC

Создать TXT:

```txt
_dmarc.yasna.chat.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@yasna.chat; fo=1"
```

План ужесточения:
1. Неделя–две: `p=none` + смотреть отчёты на `dmarc@`.
2. Потом: `p=quarantine; pct=25` → 100%.
3. Позже: `p=reject` (когда SPF/DKIM aligned для всех легитимных From).

`dmarc@yasna.chat` — создать ящик или алиас и иногда читать XML (или сервис вроде Postmark DMARC / EasyDMARC).

#### B6. Alignment (важно)

Чтобы DMARC «зелёный»:
- **From domain** = `yasna.chat`
- SPF pass для Return-Path домена (или DKIM pass с `d=yasna.chat`)

На ESP From часто `mail@yasna.chat`, Return-Path на поддомене ESP (`bounce.yasna.chat` / их домен) — тогда критичен **DKIM alignment**.

---

### Фаза C — Выбор ESP для маркетинга (рекомендуется, 2–5 дней)

**Цель:** чужие чистые IP + bounce/complaint webhook + нормальные лимиты.

#### Сравнение вариантов (практика для РФ / `yasna.chat`)

| Сервис | Плюсы | Минусы | Когда брать |
|--------|-------|--------|-------------|
| **Unisender** (классика) | RU-интерфейс, валидатор, кампании, понятные тарифы | Свой UI дублирует админку | Быстрый старт маркетинга |
| **Unisender Go** | Transactional/API-first, ближе к «встроить в наш queue» | Меньше «маркетингового комбайна» | Если шлём **из своего кода** (наш случай) |
| **Amazon SES** | Дёшево на объёме, мощно | Sandbox, AWS, SNS webhooks, аккуратнее с РФ-картами | 10k+/мес, есть DevOps |
| **Mailgun / Postmark / SendGrid / Brevo** | Отличный API, bounce | Цена/гео/политика аккаунтов | Альтернативы SES |
| **Beget SMTP** | Уже есть | Shared IP, баны, нет нормальных bounce API | **Только OTP** |

**Рекомендация для ЯСНА:**
1. Короткий срок: **Unisender Go** (или Unisender API `sendEmail`) как транспорт маркетинга.  
2. Средний срок при росте: оценить **SES**, если объём и экономика выгодно.  
3. Beget SMTP **не** использовать для массовых.

Почему не «только валидация»: ESP даёт **репутацию инфраструктуры** + автоматический разбор bounce/spam complaints. Validator — фильтр списка, не замена каналу доставки.

#### C1. Чеклист внедрения Unisender Go (или Unisender API)

1. Аккаунт, верификация домена `yasna.chat` (SPF/DKIM из их кабинета).
2. Env:
   ```env
   MAIL_PROVIDER=unisender_go   # или unisender
   UNISENDER_API_KEY=...
   UNISENDER_GO_BASE_URL=...    # из кабинета, если Go
   ```
3. В коде: `sendMarketingEmail` → ветка API; `sendSimpleEmail` (OTP) → Beget.
4. Webhook:
   - hard bounce / complaint → `suppressMailSubscriber`
   - unsubscribe → `isSubscribed=false` (или их unsub + наш токен)
5. Сохранить наши капы и List-Unsubscribe.
6. Тест: 20 адресов → mail-tester → Postmaster → потом сегмент 200/день → рост.

#### C2. Что остаётся в нашем приложении

- Админка кампаний/цепочек/списков  
- `mail_sends` очередь + cron  
- Footer, unsubscribe page  
- Suppress / дневные лимиты  

Что уходит в ESP: SMTP handshake и IP reputation.

---

### Фаза D — Гигиена базы (параллельно с C)

- [ ] Не слать тем, у кого `suppressedAt` / unsubscribed  
- [ ] Перед крупной кампанией — разовый прогон validator (Unisender) **опционально**  
- [ ] Сегменты: активные за N дней, открывавшие, платящие — не «все registered» первым прогревом  
- [ ] Отдельный список «iCloud/Gmail cold» не лить с Beget  
- [ ] Чистить bounce-папку ящика отправителя  

Прогрев после разбана / нового канала:
| День | Объём (ориентир) |
|------|------------------|
| 1–2 | 50–100 |
| 3–5 | 150–250 |
| 6–10 | 300–500 |
| далее | по капу ESP + нашим лимитам |

---

### Фаза E — Контент и жалобы

- Понятный From: `YASNA <mail@yasna.chat>`  
- Реальный Reply-To  
- Ссылка отписки (уже есть) + физический/юр. блок в футере  
- Не маскировать ссылки редиректами-спамом  
- Один CTA, нормальное соотношение текст/картинки  
- Жалобы «спам» хуже bounce — лучше реже, но теплее аудитория  

---

### Фаза F — Мониторинг (постоянно)

- [ ] Google Postmaster Tools — spam rate, domain reputation  
- [ ] Логи cron / админ-баннер лимитов  
- [ ] Раз в неделю: % `mail_sends` failed, топ ошибок  
- [ ] DMARC aggregate reports  
- [ ] После перехода на ESP — dashboard bounce/complaint  

Алерты уже есть (`ADMIN_ALERTS_EMAIL` на OTP-ящик).

---

## 4. SPF / DKIM / DMARC — шпаргалка «проверить и настроить»

### Порядок работ на `yasna.chat`

1. Узнать, где DNS (Beget / Cloudflare / др.).
2. Включить DKIM в почте Beget → скопировать TXT.
3. Выставить/поправить SPF с `include:beget.com`.
4. Добавить DMARC `p=none` + `rua=mailto:dmarc@yasna.chat`.
5. Подождать 15–60 мин (иногда до суток) → `dig` / MxToolbox.
6. Отправить себе письмо → https://www.mail-tester.com  
7. Перед Unisender — добавить **их** SPF include + DKIM, не ломая Beget.

### Частые ошибки

- Две TXT `v=spf1` на одном имени → SPF broken.  
- DKIM выключили в панели, запись в DNS осталась (или наоборот).  
- From `yasna.chat`, а SPF только чужой ESP без include.  
- Сразу `p=reject` без мониторинга.  
- Маркетинг с `mail@`, OTP с другого домена без своих записей.

---

## 5. Решение «валидация vs платный сервис»

```
                    ┌──────────────┐
   Список адресов → │ Validator    │  optional, pre-campaign
                    │ (Unisender)  │
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
              очередь ЯСНА (caps)
                    └──────┬───────┘
                           ▼
              ┌────────────┴────────────┐
              │                         │
        Beget SMTP                 ESP (Unisender Go / SES)
        только OTP                 маркетинг + bounce webhook
```

| Подход | Оценка |
|--------|--------|
| Только валидация + Beget SMTP | **Плохо** для массы — ban снова вероятен |
| Капы + suppress + MX + Beget | Временно терпимо на малых объёмах |
| **ESP с репутацией + наш queue** | **Правильное** решение |
| ESP + редкий validator на холодных импортах | Оптимум |

**Unisender Go** — да, хороший кандидат именно потому что API/транзакционный уклон подходит под текущую архитектуру (`processMailQueue` → HTTP API), а не под ручные кампании в чужом UI.

---

## 6. Приоритеты на ближайшие 2 недели

| # | Задача | Владелец | Статус |
|---|--------|----------|--------|
| 1 | Проверить/настроить SPF+DKIM Beget + DMARC `p=none` | Ops | TODO |
| 2 | mail-tester ≥ 8/10 с OTP-ящика и (после разбана) с mail@ | Ops | TODO |
| 3 | Google Postmaster для `yasna.chat` | Ops | TODO |
| 4 | Не слать маркетинг с Beget SMTP сверх капов | Product | WIP |
| 5 | Выбрать ESP: **Unisender Go** (default) vs SES | Product | TODO |
| 6 | Вкод: `MAIL_PROVIDER` + webhook suppress | Dev | TODO |
| 7 | Прогрев 50→500/день на ESP | Product | TODO |
| 8 | Выделенный IP VPS Beget — **только если** нужен сайту/своему MTA; для рассылок через smtp.beget.com **не брать как решение** | Ops | skip / optional |
| 9 | Опционально: разовый validator перед крупным cold list | Product | later |

---

## 7. Связанные файлы в репо

- `lib/email-transport.ts` — SMTP OTP vs marketing  
- `lib/mail-send-guard.ts` — дневной/часовой кап, пауза при бане ящика  
- `lib/email-validation.ts` — синтаксис + MX  
- `lib/smtp-errors.ts` — 554/HM08 → suppress  
- `scripts/suppress-from-bounces.ts` — исторические фейлы  
- `docs/MAILING_AT_SCALE.md` — масштабирование очереди  
- Env: `SMTP_*`, `SMTP_OTP_*`, `MAIL_*_CAP`, `MAIL_VALIDATE_MX`

---

## 8. Итог одной фразой

**Репутация домена важна, но письмо через Beget SMTP уходит с их shared IP; выделенный IP VPS на Beget сам по себе рассылки не лечит — для маркетинга нужен ESP (Unisender Go / SES), SPF/DKIM/DMARC — фундамент, валидация — аптечка, свой MTA на VPS — крайний и тяжёлый путь.**
