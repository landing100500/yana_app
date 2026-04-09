'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

interface PlanSnapshot {
  code: 'free' | 'optimal' | 'professional';
  title: string;
}

export default function TariffsPage() {
  const router = useRouter();
  const [currentPlan, setCurrentPlan] = useState<PlanSnapshot | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/profile', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.plan) setCurrentPlan(data.plan);
    })();
  }, []);

  const plans = [
    {
      code: 'free',
      title: 'Бесплатный',
      price: '0 ₽',
      items: ['60 минут раз в 7 дней', 'Карты создавать нельзя', 'Сравнение карт недоступно'],
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
      <div className={styles.grid}>
        {plans.map((plan) => (
          <div key={plan.code} className={styles.card}>
            <h3>{plan.title}</h3>
            <p className={styles.price}>{plan.price}</p>
            <ul>
              {plan.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
            {plan.code !== 'free' && (
              <button className={styles.button} disabled={currentPlan?.code === plan.code}>
                {currentPlan?.code === plan.code ? 'Текущий тариф' : 'Выбрать'}
              </button>
            )}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
