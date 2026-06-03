'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isValidEmail, normalizeEmail } from '@/lib/email';
import SiteFooter from '@/components/SiteFooter';
import styles from './page.module.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    if (!isValidEmail(cleanEmail) || !password) {
      setError('Заполните все поля');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: cleanEmail, password }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push('/chat');
        return;
      } else {
        setError(data.error || 'Неверный email или пароль');
        setIsLoading(false);
      }
    } catch (err) {
      setError('Произошла ошибка при входе');
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
        <h1 className={styles.title}>Вход</h1>
        <p className={styles.subtitle}>Email и 4-значный код доступа</p>

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

          <div className={styles.inputGroup}>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              name="password"
              placeholder="4 цифры"
              maxLength={4}
              value={password ?? ''}
              onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className={styles.input}
              aria-label="Код из 4 цифр"
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
              'Войти'
            )}
          </button>
        </form>

        <div className={styles.links}>
          <a href="/" className={styles.link}>Вход по email</a>
          <span className={styles.separator}>•</span>
          <a href="/reset" className={styles.link}>Забыли пароль?</a>
        </div>
      </div>
      <SiteFooter className={styles.siteFooter} showInstallLink />
    </div>
  );
}

