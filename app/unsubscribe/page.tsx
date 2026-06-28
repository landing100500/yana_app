'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './page.module.css';

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Недействительная ссылка');
      setLoading(false);
      return;
    }

    fetch(`/api/mail/unsubscribe?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setEmail(data.email);
          setIsSubscribed(data.isSubscribed);
        }
      })
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [token]);

  const unsubscribe = async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch('/api/mail/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (res.ok) {
      setIsSubscribed(false);
      setDone(true);
    } else {
      setError(data.error || 'Ошибка');
    }
    setLoading(false);
  };

  const resubscribe = async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch('/api/mail/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'resubscribe' }),
    });
    if (res.ok) {
      setIsSubscribed(true);
      setDone(false);
    }
    setLoading(false);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Рассылка ЯСНА</h1>
        {loading && <p>Загрузка...</p>}
        {error && <p className={styles.error}>{error}</p>}
        {!loading && !error && (
          <>
            {email && <p className={styles.email}>{email}</p>}
            {isSubscribed ? (
              <>
                <p>Вы можете отписаться от email-рассылок ЯСНА. OTP-коды для входа продолжат приходить.</p>
                {!done ? (
                  <button type="button" className={styles.btnDanger} onClick={unsubscribe} disabled={loading}>
                    Отписаться от рассылки
                  </button>
                ) : (
                  <p className={styles.success}>Вы успешно отписались от рассылки.</p>
                )}
              </>
            ) : (
              <>
                <p className={styles.success}>Вы отписаны от рассылок.</p>
                <button type="button" className={styles.btnSecondary} onClick={resubscribe} disabled={loading}>
                  Подписаться снова
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className={styles.page}>Загрузка...</div>}>
      <UnsubscribeContent />
    </Suspense>
  );
}
