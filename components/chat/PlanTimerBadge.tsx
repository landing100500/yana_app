'use client';

import { useEffect, useState } from 'react';
import styles from '@/app/chat/page.module.css';

type Plan = {
  code: string;
  title: string;
  expiresAt: string | null;
  hasUnlimitedTime: boolean;
  remainingSeconds: number | null;
};

type Props = {
  plan: Plan;
  className?: 'desktop' | 'mobile';
};

function formatTimer(plan: Plan, remainingSeconds: number | null): string {
  if (plan.hasUnlimitedTime) {
    if (plan.expiresAt) {
      return `Доступ до ${new Date(plan.expiresAt).toLocaleDateString('ru-RU')}`;
    }
    return 'Безлимитный доступ';
  }
  const sec = Math.max(0, remainingSeconds ?? plan.remainingSeconds ?? 0);
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  return `Осталось: ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** Таймер тарифа в отдельном компоненте — не перерисовывает всю страницу чата */
export default function PlanTimerBadge({ plan, className = 'desktop' }: Props) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(
    plan.hasUnlimitedTime ? null : (plan.remainingSeconds ?? 0)
  );

  useEffect(() => {
    if (plan.hasUnlimitedTime) return;
    const id = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null) return prev;
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [plan.hasUnlimitedTime]);

  if (className === 'mobile') {
    return (
      <div className={styles.mobilePlanTimerBadge}>
        <strong>{plan.title}</strong>
        <span>{formatTimer(plan, remainingSeconds)}</span>
      </div>
    );
  }

  return (
    <div className={styles.planTimerBadge}>
      <strong>{plan.title}</strong>
      <span>{formatTimer(plan, remainingSeconds)}</span>
    </div>
  );
}
