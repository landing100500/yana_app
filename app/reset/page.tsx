'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function ResetPage() {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!phone) {
      setError('Введите номер телефона');
      return;
    }

    try {
      const response = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else {
        setError(data.error || 'Произошла ошибка');
      }
    } catch (err) {
      setError('Произошла ошибка при отправке запроса');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Сброс пароля</h1>
        <p className={styles.subtitle}>Введите номер телефона для восстановления</p>

        {success ? (
          <div className={styles.success}>
            <p>Инструкции по восстановлению пароля отправлены на ваш телефон</p>
          </div>
        ) : (
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

            {error && <div className={styles.error}>{error}</div>}

            <button type="submit" className={styles.button}>
              Отправить
            </button>
          </form>
        )}

        <div className={styles.links}>
          <a href="/" className={styles.link}>Вход по SMS</a>
          <span className={styles.separator}>•</span>
          <a href="/login" className={styles.link}>Вход по паролю</a>
        </div>
      </div>
    </div>
  );
}

