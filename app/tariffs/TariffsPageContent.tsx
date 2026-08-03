'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import SiteFooter from '@/components/SiteFooter';
import Link from 'next/link';
import {
  getPendingPaymentId,
  onPlanUpdated,
  pollPaymentUntilSettled,
  resumePendingPaymentPoll,
  setPendingPaymentId,
} from '@/lib/payment-poll-client';
import styles from './page.module.css';

type PlanCode = 'free' | 'hours24' | 'optimalLight' | 'optimal' | 'professional';
type PaidPlanCode = Exclude<PlanCode, 'free'>;

interface PlanSnapshot {
  code: PlanCode;
  title: string;
}

type PaymentNotice = {
  type: 'success' | 'pending' | 'error';
  message: string;
};

type FeatureValue = string | boolean;

interface PlanColumn {
  code: PlanCode;
  title: string;
  price: string;
  paid: boolean;
}

interface FeatureRow {
  label: string;
  values: Record<PlanCode, FeatureValue>;
}

const PLAN_COLUMNS: PlanColumn[] = [
  { code: 'free', title: 'Бесплатный', price: '0 ₽', paid: false },
  { code: 'hours24', title: '24 часа', price: '900 ₽', paid: true },
  { code: 'optimalLight', title: 'Оптимальный Лайт', price: '2 990 ₽', paid: true },
  { code: 'optimal', title: 'Оптимальный', price: '9 900 ₽', paid: true },
  { code: 'professional', title: 'Профессиональный', price: '49 000 ₽', paid: true },
];

const PROMO_MONTHLY = new Set<PlanCode>(['optimalLight', 'optimal']);

function formatPromoPrice(basePriceLabel: string): string {
  // «2 990 ₽» → «5 980 ₽» (×2)
  const digits = basePriceLabel.replace(/[^\d]/g, '');
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return basePriceLabel;
  return `${(n * 2).toLocaleString('ru-RU')} ₽`;
}

const FEATURE_ROWS: FeatureRow[] = [
  {
    label: 'Срок доступа',
    values: {
      free: 'Бессрочно',
      hours24: '24 часа',
      optimalLight: '30 дней',
      optimal: '30 дней',
      professional: '180 дней',
    },
  },
  {
    label: 'Время в Ясне',
    values: {
      free: '10 запросов к ИИ',
      hours24: '24 ч сессия',
      optimalLight: '1 ч в сутки',
      optimal: 'Без ограничений',
      professional: 'Без ограничений',
    },
  },
  {
    label: 'Создание карт',
    values: {
      free: false,
      hours24: false,
      optimalLight: 'До 5 карт',
      optimal: 'До 5 карт',
      professional: 'Без ограничений',
    },
  },
  {
    label: 'Сравнение карт',
    values: {
      free: false,
      hours24: false,
      optimalLight: true,
      optimal: true,
      professional: true,
    },
  },
];

function renderFeatureValue(value: FeatureValue) {
  if (value === true) {
    return <span className={styles.check} aria-label="Да">✓</span>;
  }
  if (value === false) {
    return <span className={styles.dash} aria-label="Нет">—</span>;
  }
  return <span className={styles.featureText}>{value}</span>;
}

export default function TariffsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentPlan, setCurrentPlan] = useState<PlanSnapshot | null>(null);
  const [isReferral, setIsReferral] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<PaymentNotice | null>(null);

  const loadProfile = useCallback(async () => {
    let res = await fetch('/api/auth/profile', { credentials: 'include' });
    if (res.status === 401) {
      const backupToken = localStorage.getItem('auth_token_backup');
      if (backupToken) {
        const restoreRes = await fetch('/api/auth/set-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: backupToken }),
          credentials: 'include',
        });
        if (restoreRes.ok) {
          res = await fetch('/api/auth/profile', { credentials: 'include' });
        }
      }
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.plan) setCurrentPlan(data.plan);
    if (res.ok) setIsReferral(Boolean(data?.isReferral));
    return res.ok;
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handlePaymentPollResult = useCallback(
    (result: Awaited<ReturnType<typeof pollPaymentUntilSettled>>, clearQuery = false) => {
      if (result.status === 'succeeded') {
        if (result.plan) setCurrentPlan(result.plan as PlanSnapshot);
        setPaymentNotice({
          type: 'success',
          message: `Оплата прошла успешно. Активирован тариф «${result.plan?.title || ''}».`,
        });
        if (clearQuery) router.replace('/tariffs');
        return;
      }

      if (result.status === 'canceled') {
        setPaymentNotice({
          type: 'error',
          message: 'Оплата отменена. Тариф не изменён.',
        });
        if (clearQuery) router.replace('/tariffs');
        return;
      }

      if (result.status === 'pending') {
        setPaymentNotice({
          type: 'pending',
          message: result.message || 'Платёж ещё обрабатывается. Доступ откроется автоматически.',
        });
        if (clearQuery) router.replace('/tariffs');
        return;
      }

      setPaymentNotice({
        type: 'error',
        message: result.message || 'Не удалось проверить статус оплаты',
      });
      if (clearQuery) router.replace('/tariffs');
    },
    [router]
  );

  useEffect(() => {
    const paymentId = searchParams.get('payment');
    if (!paymentId) return;

    let cancelled = false;

    setPaymentNotice({
      type: 'pending',
      message: 'Проверяем статус оплаты...',
    });

    pollPaymentUntilSettled(paymentId).then((result) => {
      if (cancelled) return;
      handlePaymentPollResult(result, true);
    });

    return () => {
      cancelled = true;
    };
  }, [handlePaymentPollResult, searchParams]);

  useEffect(() => {
    if (searchParams.get('payment')) return;

    const pendingId = getPendingPaymentId();
    if (!pendingId) return;

    resumePendingPaymentPoll({
      onSucceeded: (plan) => {
        if (plan) setCurrentPlan(plan as PlanSnapshot);
        handlePaymentPollResult({ status: 'succeeded', plan });
        loadProfile();
      },
      onCanceled: () => {
        handlePaymentPollResult({ status: 'canceled' });
      },
      onPending: (message) => {
        handlePaymentPollResult({ status: 'pending', message });
      },
      onError: (message) => {
        handlePaymentPollResult({ status: 'error', message });
      },
    });
  }, [handlePaymentPollResult, loadProfile, searchParams]);

  useEffect(() => {
    return onPlanUpdated((plan) => {
      if (plan) setCurrentPlan(plan as PlanSnapshot);
      loadProfile();
    });
  }, [loadProfile]);

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
          body: JSON.stringify({ planCode, promo2plus1: isReferral && PROMO_MONTHLY.has(planCode) }),
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

      if (data.paymentId) {
        setPendingPaymentId(data.paymentId);
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

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <button className={styles.backButton} onClick={() => router.push('/chat')}>← Назад</button>
        <h1>Тарифы</h1>
        <p className={styles.currentPlanLine}>
          <span className={styles.currentPlanLabel}>Текущий тариф:</span>{' '}
          <span className={styles.currentPlanValue}>{currentPlan?.title || '—'}</span>
        </p>

        {isReferral && (
          <div className={`${styles.notice} ${styles.noticeSuccess}`}>
            По реферальной ссылке для тарифов «Оптимальный Лайт» и «Оптимальный»: оплатите 2 месяца —
            3-й в подарок (90 дней доступа).
          </div>
        )}

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

        <div className={styles.tableWrap}>
          <table className={styles.compareTable}>
            <thead>
              <tr>
                <th className={styles.featureCol} scope="col">Возможности</th>
                {PLAN_COLUMNS.map((plan) => {
                  const promo = isReferral && PROMO_MONTHLY.has(plan.code);
                  return (
                  <th
                    key={plan.code}
                    scope="col"
                    className={`${styles.planCol} ${currentPlan?.code === plan.code ? styles.planColCurrent : ''}`}
                  >
                    <div className={styles.planHeader}>
                      <span className={styles.planTitle}>{plan.title}</span>
                      <span className={styles.planPrice}>
                        {promo ? formatPromoPrice(plan.price) : plan.price}
                      </span>
                      {promo && (
                        <span className={styles.currentBadge}>2+1</span>
                      )}
                      {currentPlan?.code === plan.code && (
                        <span className={styles.currentBadge}>Ваш тариф</span>
                      )}
                    </div>
                  </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map((row) => (
                <tr key={row.label}>
                  <th className={styles.featureCol} scope="row">{row.label}</th>
                  {PLAN_COLUMNS.map((plan) => {
                    let value = row.values[plan.code];
                    if (
                      isReferral &&
                      PROMO_MONTHLY.has(plan.code) &&
                      row.label === 'Срок доступа'
                    ) {
                      value = '90 дней (2+1)';
                    }
                    return (
                    <td
                      key={plan.code}
                      className={`${styles.planCol} ${currentPlan?.code === plan.code ? styles.planColCurrent : ''}`}
                    >
                      {renderFeatureValue(value)}
                    </td>
                    );
                  })}
                </tr>
              ))}
              <tr className={styles.actionRow}>
                <th className={styles.featureCol} scope="row" />
                {PLAN_COLUMNS.map((plan) => (
                  <td
                    key={plan.code}
                    className={`${styles.planCol} ${currentPlan?.code === plan.code ? styles.planColCurrent : ''}`}
                  >
                    {plan.paid ? (
                      <button
                        className={`${styles.button} ${loadingPlan === plan.code ? styles.buttonLoading : ''}`}
                        disabled={currentPlan?.code === plan.code || loadingPlan === plan.code}
                        onClick={() => handleSelectPlan(plan.code as PaidPlanCode)}
                        aria-busy={loadingPlan === plan.code}
                      >
                        {loadingPlan === plan.code ? (
                          <span className={styles.spinner} aria-label="Переход к оплате" />
                        ) : currentPlan?.code === plan.code ? (
                          'Текущий'
                        ) : (
                          'Оплатить'
                        )}
                      </button>
                    ) : (
                      <span className={styles.freeLabel}>По умолчанию</span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
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
