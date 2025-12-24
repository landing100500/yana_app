'use client';

import { useState, useEffect } from 'react';
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

