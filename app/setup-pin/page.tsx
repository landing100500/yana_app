'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SiteFooter from '@/components/SiteFooter';
import styles from '../verify/page.module.css';

export default function SetupPinPage() {
  const [pin, setPin] = useState(['', '', '', '']);
  const [confirm, setConfirm] = useState(['', '', '', '']);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = sessionStorage.getItem('pinSetupToken');
    if (!t) {
      router.replace('/');
    }
  }, [router]);

  const handleChange = (
    which: 'pin' | 'confirm',
    index: number,
    value: string
  ) => {
    if (value.length > 1) return;
    const setter = which === 'pin' ? setPin : setConfirm;
    const arr = which === 'pin' ? pin : confirm;
    const next = [...arr];
    next[index] = value;
    setter(next);

    if (value && index < 3) {
      document.getElementById(`${which}-${index + 1}`)?.focus();
    }
  };

  const handleKeyDown = (which: 'pin' | 'confirm', index: number, e: React.KeyboardEvent) => {
    const arr = which === 'pin' ? pin : confirm;
    if (e.key === 'Backspace' && !arr[index] && index > 0) {
      document.getElementById(`${which}-${index - 1}`)?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const p = pin.join('');
    const c = confirm.join('');
    if (p.length !== 4 || c.length !== 4) {
      setError('Введите код полностью');
      return;
    }

    const pinSetupToken = sessionStorage.getItem('pinSetupToken');
    if (!pinSetupToken) {
      setError('Сессия истекла');
      router.replace('/');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/set-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: p, pinConfirm: c, pinSetupToken }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        sessionStorage.removeItem('pinSetupToken');
        if (data.token) {
          localStorage.setItem('auth_token_backup', data.token);
        }
        await new Promise((r) => setTimeout(r, 100));
        window.location.href = '/chat';
      } else {
        setError(data.error || 'Не удалось сохранить');
        setIsLoading(false);
      }
    } catch {
      setError('Произошла ошибка');
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
        <h1 className={styles.title}>Код доступа</h1>
        <p className={styles.subtitle}>Придумайте 4 цифры для входа в приложение</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', marginBottom: '-0.5rem' }}>
            Код
          </p>
          <div className={styles.codeInputs}>
            {pin.map((digit, index) => (
              <input
                key={`p-${index}`}
                id={`pin-${index}`}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange('pin', index, e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => handleKeyDown('pin', index, e)}
                className={styles.codeInput}
                autoFocus={index === 0}
                autoComplete="new-password"
              />
            ))}
          </div>

          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', marginBottom: '-0.5rem' }}>
            Повторите код
          </p>
          <div className={styles.codeInputs}>
            {confirm.map((digit, index) => (
              <input
                key={`c-${index}`}
                id={`confirm-${index}`}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange('confirm', index, e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => handleKeyDown('confirm', index, e)}
                className={styles.codeInput}
                autoComplete="new-password"
              />
            ))}
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
              'Сохранить и войти'
            )}
          </button>
        </form>
      </div>
      <SiteFooter className={styles.siteFooter} showInstallLink />
    </div>
  );
}
