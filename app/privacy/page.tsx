'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import { LEGAL_ENTITY } from '@/lib/legal-info';
import styles from './page.module.css';

export default function PrivacyPage() {
  const [stars, setStars] = useState<Array<{ id: number; x: number; y: number; delay: number; duration: number }>>([]);

  useEffect(() => {
    const newStars = Array.from({ length: 150 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 3,
      duration: 9 + Math.random() * 12,
    }));
    setStars(newStars);
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.starsContainer}>
        {stars.map((star) => {
          const centerX = 50;
          const centerY = 50;
          const dx = centerX - star.x;
          const dy = centerY - star.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const moveX = (dx / distance) * 100;
          const moveY = (dy / distance) * 100;

          return (
            <div
              key={star.id}
              className={styles.star}
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                '--move-x': `${moveX}vw`,
                '--move-y': `${moveY}vh`,
                animationDelay: `${star.delay}s`,
                animationDuration: `${star.duration}s`,
              } as React.CSSProperties}
            />
          );
        })}
      </div>

      <div className={styles.content}>
        <h1 className={styles.title}>Политика конфиденциальности</h1>
        <p className={styles.subtitle}>Редакция от 19 мая 2026 г.</p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. Общие положения</h2>
          <p className={styles.text}>
            Настоящая Политика конфиденциальности (далее — «Политика») определяет порядок обработки
            и защиты персональных данных пользователей сервиса {LEGAL_ENTITY.siteName} ({LEGAL_ENTITY.site}).
          </p>
          <p className={styles.text}>
            Оператор персональных данных: {LEGAL_ENTITY.name}, ИНН {LEGAL_ENTITY.inn},
            телефон {LEGAL_ENTITY.phone}, email {LEGAL_ENTITY.email}.
          </p>
          <p className={styles.text}>
            Используя сервис, вы подтверждаете, что ознакомились с настоящей Политикой.
            Если вы не согласны с её условиями, пожалуйста, не используйте сервис.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. Какие данные мы обрабатываем</h2>
          <p className={styles.text}>Мы можем обрабатывать следующие персональные данные:</p>
          <ul className={styles.list}>
            <li>адрес электронной почты;</li>
            <li>номер телефона;</li>
            <li>имя (если указано пользователем);</li>
            <li>данные анкеты и натальной карты (дата, время и место рождения и связанные сведения);</li>
            <li>история сообщений в чате с сервисом;</li>
            <li>технические данные: IP-адрес, cookies, данные сессии, сведения об устройстве и браузере;</li>
            <li>сведения об оплате тарифов (статус платежа, сумма, идентификатор транзакции). Данные банковской карты обрабатываются платёжным сервисом ЮKassa и нам не передаются.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. Цели обработки данных</h2>
          <p className={styles.text}>Персональные данные обрабатываются для:</p>
          <ul className={styles.list}>
            <li>регистрации и авторизации в сервисе;</li>
            <li>предоставления доступа к функциям сервиса в соответствии с выбранным тарифом;</li>
            <li>обработки платежей и учёта подписок;</li>
            <li>технической поддержки и улучшения качества сервиса;</li>
            <li>исполнения требований законодательства Российской Федерации.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. Правовые основания</h2>
          <p className={styles.text}>
            Обработка персональных данных осуществляется на основании согласия пользователя,
            необходимости исполнения договора (публичной оферты), а также в случаях,
            предусмотренных Федеральным законом № 152-ФЗ «О персональных данных».
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. Передача данных третьим лицам</h2>
          <p className={styles.text}>
            Мы можем передавать данные только в объёме, необходимом для работы сервиса:
          </p>
          <ul className={styles.list}>
            <li>платёжному оператору ЮKassa — для приёма оплаты;</li>
            <li>хостинг-провайдерам и техническим подрядчикам — для хранения и обработки данных;</li>
            <li>государственным органам — при наличии законного требования.</li>
          </ul>
          <p className={styles.text}>
            Передача данных за пределы Российской Федерации может осуществляться только при наличии
            надлежащих правовых оснований и мер защиты, предусмотренных законом.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. Срок хранения данных</h2>
          <p className={styles.text}>
            Данные хранятся в течение срока использования сервиса и до достижения целей обработки,
            если более длительный срок не требуется законом или для защиты прав оператора.
            По запросу пользователя данные могут быть удалены, если это не противоречит закону.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>7. Защита данных</h2>
          <p className={styles.text}>
            Мы применяем организационные и технические меры для защиты персональных данных
            от неправомерного доступа, изменения, раскрытия или уничтожения, включая
            ограничение доступа, шифрование соединений (HTTPS) и контроль сессий пользователей.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>8. Права пользователя</h2>
          <p className={styles.text}>Вы вправе:</p>
          <ul className={styles.list}>
            <li>получить информацию об обработке ваших персональных данных;</li>
            <li>требовать уточнения, блокирования или удаления данных;</li>
            <li>отозвать согласие на обработку данных;</li>
            <li>обжаловать действия оператора в уполномоченный орган или в суд.</li>
          </ul>
          <p className={styles.text}>
            Для реализации прав направьте запрос на {LEGAL_ENTITY.email} или позвоните по номеру{' '}
            {LEGAL_ENTITY.phone}.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>9. Cookies и аналитика</h2>
          <p className={styles.text}>
            Сервис использует cookies и локальное хранилище браузера для поддержания сессии
            авторизации и корректной работы функций сайта. Вы можете ограничить использование cookies
            в настройках браузера, однако это может повлиять на доступность отдельных функций.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>10. Изменение Политики</h2>
          <p className={styles.text}>
            Мы можем обновлять настоящую Политику. Актуальная версия всегда доступна по адресу{' '}
            <Link href="/privacy">{LEGAL_ENTITY.site}/privacy</Link>.
            Продолжение использования сервиса после публикации изменений означает согласие с новой редакцией.
          </p>
        </section>

        <div className={styles.backLink}>
          <Link href="/">← Вернуться на главную</Link>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
