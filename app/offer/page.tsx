'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import { LEGAL_ENTITY } from '@/lib/legal-info';
import styles from './page.module.css';

export default function OfferPage() {
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
        <h1 className={styles.title}>Публичная оферта</h1>
        <p className={styles.subtitle}>на оказание услуг сервиса {LEGAL_ENTITY.siteName} · редакция от 19 мая 2026 г.</p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. Общие положения</h2>
          <p className={styles.text}>
            Настоящий документ является официальным предложением {LEGAL_ENTITY.name}
            (далее — «Исполнитель») заключить договор на оказание услуг с любым дееспособным
            физическим лицом (далее — «Пользователь») на условиях настоящей публичной оферты
            в соответствии со ст. 437 Гражданского кодекса РФ.
          </p>
          <p className={styles.text}>
            Акцептом оферты считается регистрация в сервисе, оплата тарифа либо фактическое
            использование платных функций сервиса {LEGAL_ENTITY.siteName} ({LEGAL_ENTITY.site}).
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. Предмет договора</h2>
          <p className={styles.text}>
            Исполнитель предоставляет Пользователю доступ к онлайн-сервису {LEGAL_ENTITY.siteName} —
            интерактивной цифровой платформе в области ведической астрологии, самопознания и
            информационно-образовательных материалов, включающей чат-функции, инструменты анализа
            натальной карты и автоматизированные технологии обработки пользовательских запросов
            в соответствии с выбранным тарифом.
          </p>
          <p className={styles.text}>
            Услуги оказываются дистанционно, в электронной форме, через сайт {LEGAL_ENTITY.site}.
          </p>
          <p className={styles.text}>
            Все материалы и функции сервиса носят исключительно информационно-образовательный характер
            и предназначены для целей самопознания, изучения ведической астрологии и персонального анализа.
          </p>
          <p className={styles.text}>
            Сервис не является медицинской, психологической, психотерапевтической, юридической либо иной
            профессиональной консультацией.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. Тарифы и стоимость</h2>
          <p className={styles.text}>
            Актуальные тарифы, сроки доступа и стоимость размещены на странице{' '}
            <Link href="/tariffs">Тарифы</Link>. Стоимость услуг указывается в рублях РФ
            и включает все применимые налоги, если иное не указано на сайте.
          </p>
          <p className={styles.text}>
            Исполнитель вправе изменять тарифы. Новые цены применяются к оплатам,
            совершённым после публикации изменений на сайте.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. Порядок оплаты</h2>
          <p className={styles.text}>
            Оплата производится безналичным способом через платёжный сервис ЮKassa на сайте.
            Моментом оплаты считается подтверждение успешного платежа платёжным оператором.
          </p>
          <p className={styles.text}>
            После успешной оплаты доступ к выбранному тарифу активируется автоматически
            на срок, указанный в описании тарифа.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. Права и обязанности сторон</h2>
          <p className={styles.text}>Исполнитель обязуется:</p>
          <ul className={styles.list}>
            <li>предоставить доступ к сервису после оплаты или в рамках бесплатного тарифа;</li>
            <li>прилагать разумные усилия для поддержания работоспособности сервиса;</li>
            <li>обрабатывать персональные данные в соответствии с <Link href="/privacy">Политикой конфиденциальности</Link>.</li>
          </ul>
          <p className={styles.text}>Пользователь обязуется:</p>
          <ul className={styles.list}>
            <li>предоставлять достоверные данные при регистрации;</li>
            <li>не использовать сервис для противоправных целей;</li>
            <li>не предпринимать действий, направленных на нарушение работы сервиса.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. Ограничение ответственности</h2>
          <p className={styles.text}>
            Сервис носит информационно-образовательный характер. Материалы, интерпретации и рекомендации,
            формируемые с использованием автоматизированных технологий обработки информации, предназначены
            исключительно для целей самопознания, изучения ведической астрологии и персонального анализа.
          </p>
          <p className={styles.text}>
            Материалы сервиса не являются медицинской, психологической, психотерапевтической, юридической,
            финансовой либо иной профессиональной консультацией.
          </p>
          <p className={styles.text}>
            Пользователь самостоятельно принимает решения на основании полученной информации и несёт
            полную ответственность за последствия таких решений.
          </p>
          <p className={styles.text}>
            Исполнитель не несёт ответственности за временные технические сбои, вызванные
            работой третьих лиц (хостинг, платёжные системы, каналы связи), а также за
            невозможность использования сервиса по причинам, не зависящим от Исполнителя.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>7. Возврат средств</h2>
          <p className={styles.text}>
            В связи с цифровым характером услуги доступ предоставляется немедленно после оплаты.
            Возврат денежных средств возможен, если доступ не был предоставлен по вине Исполнителя,
            либо в иных случаях, предусмотренных законодательством РФ о защите прав потребителей.
          </p>
          <p className={styles.text}>
            Для обращения по вопросам возврата направьте запрос на {LEGAL_ENTITY.email}
            или позвоните {LEGAL_ENTITY.phone}, указав email аккаунта и дату платежа.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>8. Персональные данные</h2>
          <p className={styles.text}>
            Обработка персональных данных осуществляется в соответствии с{' '}
            <Link href="/privacy">Политикой конфиденциальности</Link>.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>9. Срок действия и изменение оферты</h2>
          <p className={styles.text}>
            Оферта действует бессрочно до её отзыва Исполнителем. Исполнитель вправе изменять
            условия оферты, публикуя новую редакцию на сайте. Изменения вступают в силу
            с момента публикации, если иной срок не указан дополнительно.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>10. Реквизиты Исполнителя</h2>
          <ul className={styles.list}>
            <li>{LEGAL_ENTITY.name}</li>
            <li>ИНН: {LEGAL_ENTITY.inn}</li>
            <li>Телефон: {LEGAL_ENTITY.phone}</li>
            <li>Email: {LEGAL_ENTITY.email}</li>
            <li>Сайт: {LEGAL_ENTITY.site}</li>
          </ul>
        </section>

        <div className={styles.backLink}>
          <Link href="/">← Вернуться на главную</Link>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
