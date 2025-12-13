'use client';

import styles from './page.module.css';

export default function PrivacyPage() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>Политика конфиденциальности</h1>
        
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. Общие положения</h2>
          <p className={styles.text}>
            Настоящая Политика конфиденциальности определяет порядок обработки и защиты 
            персональных данных пользователей сервиса ЯСНА.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. Собираемые данные</h2>
          <p className={styles.text}>
            Мы собираем следующие персональные данные:
          </p>
          <ul className={styles.list}>
            <li>Номер телефона</li>
            <li>История сообщений в чате</li>
            <li>Данные о сессиях пользователя</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. Использование данных</h2>
          <p className={styles.text}>
            Персональные данные используются исключительно для предоставления услуг 
            сервиса и улучшения качества обслуживания.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. Защита данных</h2>
          <p className={styles.text}>
            Мы применяем современные методы защиты данных для обеспечения безопасности 
            вашей персональной информации.
          </p>
        </section>

        <div className={styles.backLink}>
          <a href="/">← Вернуться на главную</a>
        </div>
      </div>
    </div>
  );
}

