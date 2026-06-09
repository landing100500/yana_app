'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import SiteFooter from '@/components/SiteFooter';
import Link from 'next/link';
import styles from './page.module.css';

interface PlanSnapshot {
  code: 'free' | 'hours24' | 'optimal' | 'professional';
  title: string;
}

type PaidPlanCode = 'hours24' | 'optimal' | 'professional';

type PaymentNotice = {
  type: 'success' | 'pending' | 'error';
  message: string;
};

export default function TariffsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentPlan, setCurrentPlan] = useState<PlanSnapshot | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<PaymentNotice | null>(null);
  const pollRef = useRef<number | null>(null);

  const loadProfile = useCallback(async () => {
    const res = await fetch('/api/auth/profile', { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.plan) setCurrentPlan(data.plan);
    return res.ok;
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const paymentId = searchParams.get('payment');
    if (!paymentId) return;

    let attempts = 0;
    const maxAttempts = 20;

    const pollStatus = async () => {
      attempts += 1;
      const res = await fetch(`/api/payments/status?id=${encodeURIComponent(paymentId)}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setPaymentNotice({
          type: 'error',
          message: data?.error || 'Не удалось проверить статус оплаты',
        });
        router.replace('/tariffs');
        return;
      }

      if (data.status === 'succeeded') {
        if (data.plan) setCurrentPlan(data.plan);
        setPaymentNotice({
          type: 'success',
          message: `Оплата прошла успешно. Активирован тариф «${data.plan?.title || ''}».`,
        });
        router.replace('/tariffs');
        return;
      }

      if (data.status === 'canceled') {
        setPaymentNotice({
          type: 'error',
          message: 'Оплата отменена. Тариф не изменён.',
        });
        router.replace('/tariffs');
        return;
      }

      if (attempts >= maxAttempts) {
        setPaymentNotice({
          type: 'pending',
          message: 'Платёж ещё обрабатывается. Обновите страницу через минуту.',
        });
        router.replace('/tariffs');
        return;
      }

      pollRef.current = window.setTimeout(pollStatus, 3000);
    };

    setPaymentNotice({
      type: 'pending',
      message: 'Проверяем статус оплаты...',
    });
    pollStatus();

    return () => {
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
  }, [router, searchParams]);

  const handleSelectPlan = async (planCode: PaidPlanCode) => {
    setLoadingPlan(planCode);
    setPaymentNotice(null);

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 30000);
      let res: Response;
      try {
        res = await fetch('/api/payments/create', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planCode }),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        router.push('/verify');
        return;
      }

      if (!res.ok || !data?.confirmationUrl) {
        setPaymentNotice({
          type: 'error',
          message: data?.error || 'Не удалось создать платёж',
        });
        return;
      }

      window.location.href = data.confirmationUrl;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        setPaymentNotice({
          type: 'error',
          message: 'Платежный сервис отвечает слишком долго. Попробуйте снова через несколько секунд.',
        });
        return;
      }
      setPaymentNotice({
        type: 'error',
        message: 'Ошибка сети при создании платежа',
      });
    } finally {
      setLoadingPlan(null);
    }
  };

  const plans = [
    {
      code: 'free',
      title: 'Бесплатный',
      price: '0 ₽',
      items: ['10 запросов к ИИ', 'Карты создавать нельзя', 'Сравнение карт недоступно'],
    },
    {
      code: 'hours24',
      title: '24 часа',
      price: '900 ₽',
      items: ['24 часа доступа к Ясне', 'Таймер сессии', 'Карты создавать нельзя', 'Сравнение карт недоступно'],
    },
    {
      code: 'optimal',
      title: 'Оптимальный',
      price: '9 900 ₽',
      items: ['Доступ 30 дней', 'Время не ограничено', 'Сравнение карт', 'До 5 карт'],
    },
    {
      code: 'professional',
      title: 'Профессиональный',
      price: '49 000 ₽',
      items: ['Доступ 180 дней', 'Время не ограничено', 'Сравнение карт', 'Карт без ограничений'],
    },
  ] as const;

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <button className={styles.backButton} onClick={() => router.push('/chat')}>← Назад</button>
        <h1>Тарифы</h1>
        <p className={styles.currentPlanLine}>
          <span className={styles.currentPlanLabel}>Текущий тариф:</span>{' '}
          <span className={styles.currentPlanValue}>{currentPlan?.title || '—'}</span>
        </p>

        {paymentNotice && (
          <div
            className={`${styles.notice} ${
              paymentNotice.type === 'success'
                ? styles.noticeSuccess
                : paymentNotice.type === 'error'
                  ? styles.noticeError
                  : styles.noticePending
            }`}
          >
            {paymentNotice.message}
          </div>
        )}

        <div className={styles.grid}>
          {plans.map((plan) => (
            <div key={plan.code} className={styles.card}>
              <h3>{plan.title}</h3>
              <p className={styles.price}>{plan.price}</p>
              <ul>
                {plan.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
              {plan.code !== 'free' && (
                <button
                  className={styles.button}
                  disabled={currentPlan?.code === plan.code || loadingPlan === plan.code}
                  onClick={() => handleSelectPlan(plan.code as PaidPlanCode)}
                >
                  {loadingPlan === plan.code
                    ? 'Переход к оплате...'
                    : currentPlan?.code === plan.code
                      ? 'Текущий тариф'
                      : 'Оплатить'}
                </button>
              )}
            </div>
          ))}
        </div>

        <p className={styles.offerNote}>
          Нажимая «Оплатить», вы принимаете условия{' '}
          <Link href="/offer">публичной оферты</Link>.
        </p>
      </div>

      <SiteFooter />
    </div>
  );
}
