'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isValidEmail, normalizeEmail } from '@/lib/email';
import SiteFooter from '@/components/SiteFooter';
import styles from './page.module.css';

export default function ResetPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stars, setStars] = useState<Array<{ id: number; x: number; y: number; delay: number; duration: number }>>([]);
  const router = useRouter();

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const cleanEmail = normalizeEmail(email);
    if (!isValidEmail(cleanEmail)) {
      setError('Введите корректный email');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('tempEmail', cleanEmail);
        sessionStorage.setItem('authResetPin', '1');
        router.push('/verify');
        return;
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
    <div className={`${styles.container} darkUi`}>
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
      <div className={styles.card}>
        <h1 className={styles.title}>Сброс пароля</h1>
        <p className={styles.subtitle}>Введите email для восстановления</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              name="email"
              placeholder="you@example.com"
              value={email ?? ''}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              aria-label="Email"
            />
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
              'Отправить код на email'
            )}
          </button>
        </form>

        <div className={styles.links}>
          <a href="/" className={styles.link}>Вход по email</a>
          <span className={styles.separator}>•</span>
          <a href="/login" className={styles.link}>Вход по паролю</a>
        </div>
      </div>
      <SiteFooter className={styles.siteFooter} showInstallLink />
    </div>
  );
}

