'use client';

import { useEffect, useState } from 'react';
import styles from '@/app/chat/page.module.css';

type Plan = {
  code: string;
  title: string;
  expiresAt: string | null;
  hasUnlimitedTime: boolean;
  hasDailyTimeLimit?: boolean;
  remainingSeconds: number | null;
  remainingAiRequests?: number | null;
};

type Props = {
  plan: Plan;
  className?: 'desktop' | 'mobile';
};

function formatBadge(plan: Plan, remainingSeconds: number | null): string {
  if (plan.hasUnlimitedTime) {
    if (plan.expiresAt) {
      return `Доступ до ${new Date(plan.expiresAt).toLocaleDateString('ru-RU')}`;
    }
    return 'Безлимитный доступ';
  }
  if (plan.code === 'free') {
    const count = Math.max(0, plan.remainingAiRequests ?? 0);
    return `Осталось запросов: ${count}`;
  }
  const sec = Math.max(0, remainingSeconds ?? plan.remainingSeconds ?? 0);
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  const timeStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  if (plan.hasDailyTimeLimit) {
    return `Сегодня осталось: ${timeStr}`;
  }
  return `Осталось: ${timeStr}`;
}

/** Таймер тарифа в отдельном компоненте — не перерисовывает всю страницу чата */
export default function PlanTimerBadge({ plan, className = 'desktop' }: Props) {
  const usesTimer = !plan.hasUnlimitedTime && plan.code !== 'free';
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(
    usesTimer ? (plan.remainingSeconds ?? 0) : null
  );

  useEffect(() => {
    if (!usesTimer) return;
    const id = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null) return prev;
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [usesTimer]);

  const label = formatBadge(plan, remainingSeconds);

  if (className === 'mobile') {
    return (
      <div className={styles.mobilePlanTimerBadge}>
        <strong>{plan.title}</strong>
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div className={styles.planTimerBadge}>
      <strong>{plan.title}</strong>
      <span>{label}</span>
    </div>
  );
}
