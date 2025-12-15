'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function Home() {
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stars, setStars] = useState<Array<{ id: number; x: number; y: number; delay: number; duration: number }>>([]);
  const router = useRouter();

  useEffect(() => {
    // Создаем звезды с случайными позициями
    const newStars = Array.from({ length: 150 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 3,
      duration: 9 + Math.random() * 12, // Увеличено в 3 раза (было 3-7, стало 9-21)
    }));
    setStars(newStars);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!phone) {
      setError('Введите номер телефона');
      return;
    }

    if (!agreed) {
      setError('Необходимо согласие с политикой конфиденциальности');
      return;
    }

    const phoneRegex = /^[+]?[0-9]{10,15}$/;
    const cleanPhone = phone.replace(/\D/g, '');
    
    if (!phoneRegex.test(cleanPhone)) {
      setError('Введите корректный номер телефона');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: cleanPhone }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('tempPhone', cleanPhone);
        router.push('/verify');
      } else {
        setError(data.error || 'Произошла ошибка');
        setIsLoading(false);
      }
    } catch (err) {
      setError('Произошла ошибка при отправке запроса');
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.starsContainer}>
        {stars.map((star) => {
          // Вычисляем направление к центру
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

      <div className={styles.logoContainer}>
        <div className={styles.logo}>
          <span className={styles.logoText}>
            <span>Я</span>
            <span className={styles.logoLetterC}>С</span>
            <span>НА</span>
          </span>
          <div className={styles.logoSubtitle}>Астрология • Натальные карты</div>
        </div>
      </div>

      <div className={styles.authCard}>
        <h1 className={styles.title}>Добро пожаловать</h1>
        <p className={styles.subtitle}>Введите номер телефона для входа</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <input
              type="tel"
              placeholder="+7 (999) 123-45-67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.checkboxGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className={styles.checkbox}
              />
              <span>Я согласен с <a href="/privacy" target="_blank">политикой конфиденциальности</a></span>
            </label>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.button} disabled={isLoading}>
            {isLoading ? (
              <span className={styles.buttonLoader}>
                <span></span>
                <span></span>
                <span></span>
              </span>
            ) : (
              'Продолжить'
            )}
          </button>
        </form>

        <div className={styles.links}>
          <a href="/login" className={styles.link}>Вход по паролю</a>
          <span className={styles.separator}>•</span>
          <a href="/reset" className={styles.link}>Забыли пароль?</a>
        </div>
      </div>
    </div>
  );
}

