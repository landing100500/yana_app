'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SiteFooter from '@/components/SiteFooter';
import styles from './page.module.css';

export default function VerifyPage() {
  const [code, setCode] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
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
    const storedEmail = localStorage.getItem('tempEmail');
    if (!storedEmail) {
      router.push('/');
    }
  }, [router]);

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(0, 1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);

    if (digit && index < 3) {
      const nextInput = document.getElementById(`code-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      const prevInput = document.getElementById(`code-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleResend = async (e: React.MouseEvent) => {
    e.preventDefault();
    setError('');
    const storedEmail = localStorage.getItem('tempEmail');
    const storedPhone = localStorage.getItem('tempPhone');
    if (!storedEmail || resendBusy) return;
    setResendBusy(true);
    try {
      const resetPin = sessionStorage.getItem('authResetPin') === '1';
      const endpoint = resetPin ? '/api/auth/reset' : '/api/auth/phone';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: storedEmail, phone: storedPhone || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Не удалось отправить письмо');
      }
    } catch {
      setError('Произошла ошибка');
    } finally {
      setResendBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const fullCode = code.join('');
    if (fullCode.length !== 4) {
      setError('Введите код полностью');
      return;
    }

    setIsLoading(true);
    try {
      const storedEmail = localStorage.getItem('tempEmail');
      const storedPhone = localStorage.getItem('tempPhone');
      const resetPin = typeof window !== 'undefined' && sessionStorage.getItem('authResetPin') === '1';
      if (!storedEmail || (!resetPin && !storedPhone)) {
        setError('Сессия истекла. Пожалуйста, начните заново.');
        setIsLoading(false);
        router.push('/');
        return;
      }

      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: fullCode, email: storedEmail, phone: storedPhone || undefined, resetPin }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        localStorage.removeItem('tempEmail');
        localStorage.removeItem('tempPhone');
        sessionStorage.removeItem('authResetPin');

        if (data.needsPinSetup && data.pinSetupToken) {
          sessionStorage.setItem('pinSetupToken', data.pinSetupToken);
          window.location.href = '/setup-pin';
          return;
        }

        if (data.token) {
          localStorage.setItem('auth_token_backup', data.token);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        window.location.href = '/chat';
      } else {
        setError(data.error || 'Неверный код');
        setIsLoading(false);
      }
    } catch (err) {
      setError('Произошла ошибка');
      setIsLoading(false);
    }
  };

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
      <div className={styles.card}>
        <h1 className={styles.title}>Подтверждение</h1>
        <p className={styles.subtitle}>Введите код из письма</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.codeInputs}>
            {code.map((digit, index) => (
              <input
                key={index}
                id={`code-${index}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className={styles.codeInput}
                autoFocus={index === 0}
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
              'Подтвердить'
            )}
          </button>
        </form>

        <p className={styles.resend}>
          Не получили код?{' '}
          <a href="#" className={styles.resendLink} onClick={handleResend}>
            {resendBusy ? 'Отправка…' : 'Отправить снова'}
          </a>
        </p>
      </div>
      <SiteFooter className={styles.siteFooter} showInstallLink />
    </div>
  );
}

