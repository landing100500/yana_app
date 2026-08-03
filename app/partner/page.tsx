'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import SiteFooter from '@/components/SiteFooter';
import styles from './page.module.css';

type LedgerRow = {
  id: number;
  type: string;
  amountRub: number;
  balanceAfter: number;
  createdAt: string;
};

type WithdrawalRow = {
  id: number;
  amountRub: number;
  ndflAmount: number;
  payoutAmount: number;
  method: string;
  status: string;
  createdAt: string;
};

type PartnerData = {
  referralCode: string;
  referralUrl: string;
  balanceRub: number;
  verificationStatus: string;
  ratePercent: number;
  payingReferralsCount: number;
  referralsTotal: number;
  minWithdrawalRub: number;
  ndflPercent: number;
  needMoreForWithdrawal: number;
  canWithdraw: boolean;
  ledger: LedgerRow[];
  withdrawals: WithdrawalRow[];
};

const PAID_PLANS = [
  { code: 'hours24', title: '24 часа', price: 900 },
  { code: 'optimalLight', title: 'Оптимальный Лайт', price: 2990 },
  { code: 'optimal', title: 'Оптимальный', price: 9900 },
  { code: 'professional', title: 'Профессиональный', price: 49000 },
] as const;

function money(n: number) {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function typeLabel(type: string) {
  switch (type) {
    case 'commission':
      return 'Начисление';
    case 'withdrawal':
      return 'Вывод';
    case 'plan_purchase':
      return 'Оплата тарифа';
    case 'adjustment':
      return 'Корректировка';
    default:
      return type;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'none':
      return 'Не загружены';
    case 'pending':
      return 'На проверке';
    case 'approved':
      return 'Подтверждена';
    case 'rejected':
      return 'Отклонена';
    case 'paid':
      return 'Выплачено';
    default:
      return status;
  }
}

export default function PartnerPage() {
  const router = useRouter();
  const [data, setData] = useState<PartnerData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState<'card' | 'sbp'>('card');
  const [requisites, setRequisites] = useState('');
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [innFile, setInnFile] = useState<File | null>(null);
  const [innNumber, setInnNumber] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/partner', { credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        setError(json.error || 'Не удалось загрузить данные');
        return;
      }
      setData(json);
    } catch {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const payoutPreview = useMemo(() => {
    if (!data) return null;
    const amount = Number(withdrawAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const ndfl = Math.round(((amount * data.ndflPercent) / 100) * 100) / 100;
    return { ndfl, payout: Math.round((amount - ndfl) * 100) / 100 };
  }, [data, withdrawAmount]);

  const copyLink = async () => {
    if (!data?.referralUrl) return;
    try {
      await navigator.clipboard.writeText(data.referralUrl);
      setNotice('Ссылка скопирована');
    } catch {
      setNotice(data.referralUrl);
    }
  };

  const payWithBalance = async (planCode: string) => {
    if (!confirm('Списать стоимость тарифа с баланса партнерки?')) return;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const res = await fetch('/api/partner/pay', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Не удалось оплатить');
        return;
      }
      setNotice(`Тариф «${json.plan?.title || planCode}» активирован`);
      await load();
    } catch {
      setError('Ошибка сети');
    } finally {
      setBusy(false);
    }
  };

  const submitWithdraw = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/partner/withdraw', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountRub: Number(withdrawAmount.replace(',', '.')),
          method: withdrawMethod,
          requisites,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Не удалось создать заявку');
        return;
      }
      setNotice(
        `Заявка создана. К выплате: ${money(json.withdrawal.payoutAmount)} ₽ (НДФЛ удержан). Рассмотрение до 5 дней.`
      );
      setWithdrawAmount('');
      setRequisites('');
      await load();
    } catch {
      setError('Ошибка сети');
    } finally {
      setBusy(false);
    }
  };

  const submitVerification = async () => {
    if (!passportFile || !innFile) {
      setError('Загрузите оба файла');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const form = new FormData();
      form.append('passport', passportFile);
      form.append('inn', innFile);
      if (innNumber.trim()) form.append('innNumber', innNumber.trim());
      const res = await fetch('/api/partner/verification', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Не удалось отправить документы');
        return;
      }
      setNotice('Документы отправлены на проверку');
      setPassportFile(null);
      setInnFile(null);
      await load();
    } catch {
      setError('Ошибка сети');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <button className={styles.backButton} onClick={() => router.push('/chat')}>
          ← Назад
        </button>
        <h1>Партнерка</h1>
        <p className={styles.lead}>
          Делитесь ссылкой — получайте процент с оплат рефералов. С баланса можно оплатить тариф Ясны
          или вывести на карту / СБП.
        </p>

        {loading && <p className={styles.muted}>Загрузка…</p>}
        {error && <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div>}
        {notice && <div className={`${styles.notice} ${styles.noticeSuccess}`}>{notice}</div>}

        {data && (
          <>
            <section className={styles.section}>
              <h2>Ваша ссылка</h2>
              <div className={styles.row}>
                <code className={styles.code}>{data.referralUrl}</code>
                <button className={styles.button} type="button" onClick={copyLink}>
                  Копировать
                </button>
              </div>
              <p className={styles.muted}>
                Ставка: <strong>{data.ratePercent}%</strong> · Оплативших рефералов:{' '}
                <strong>{data.payingReferralsCount}</strong> · Всего приглашено:{' '}
                <strong>{data.referralsTotal}</strong>
              </p>
            </section>

            <section className={styles.section}>
              <h2>Баланс</h2>
              <p className={styles.balance}>{money(data.balanceRub)} ₽</p>
            </section>

            <section className={styles.section}>
              <h2>Оплатить тариф с баланса</h2>
              <div className={styles.planGrid}>
                {PAID_PLANS.map((plan) => (
                  <button
                    key={plan.code}
                    type="button"
                    className={styles.planCard}
                    disabled={busy || data.balanceRub < plan.price}
                    onClick={() => payWithBalance(plan.code)}
                  >
                    <span>{plan.title}</span>
                    <strong>{money(plan.price)} ₽</strong>
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.section}>
              <h2>Верификация</h2>
              <p className={styles.muted}>
                Статус: <strong>{statusLabel(data.verificationStatus)}</strong>. Нужна для вывода
                денег (сканы паспорта и ИНН).
              </p>
              {data.verificationStatus !== 'approved' && data.verificationStatus !== 'pending' && (
                <div className={styles.form}>
                  <label>
                    Паспорт
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setPassportFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  <label>
                    ИНН (скан)
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setInnFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  <label>
                    ИНН (номер, необязательно)
                    <input
                      value={innNumber}
                      onChange={(e) => setInnNumber(e.target.value)}
                      placeholder="12 цифр"
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={busy}
                    onClick={submitVerification}
                  >
                    Отправить на проверку
                  </button>
                </div>
              )}
            </section>

            <section className={styles.section}>
              <h2>Вывод средств</h2>
              {data.needMoreForWithdrawal > 0 ? (
                <p className={styles.muted}>
                  Минимальная сумма вывода — {money(data.minWithdrawalRub)} ₽. Нужно ещё накопить{' '}
                  <strong>{money(data.needMoreForWithdrawal)} ₽</strong>.
                </p>
              ) : data.verificationStatus !== 'approved' ? (
                <p className={styles.muted}>Сначала пройдите верификацию документов.</p>
              ) : (
                <div className={styles.form}>
                  <label>
                    Сумма с баланса, ₽
                    <input
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      inputMode="decimal"
                      placeholder={String(data.minWithdrawalRub)}
                    />
                  </label>
                  {payoutPreview && (
                    <p className={styles.muted}>
                      НДФЛ {data.ndflPercent}%: {money(payoutPreview.ndfl)} ₽ · К получению:{' '}
                      <strong>{money(payoutPreview.payout)} ₽</strong>
                    </p>
                  )}
                  <label>
                    Способ
                    <select
                      value={withdrawMethod}
                      onChange={(e) => setWithdrawMethod(e.target.value as 'card' | 'sbp')}
                    >
                      <option value="card">Карта</option>
                      <option value="sbp">СБП</option>
                    </select>
                  </label>
                  <label>
                    Реквизиты
                    <input
                      value={requisites}
                      onChange={(e) => setRequisites(e.target.value)}
                      placeholder={withdrawMethod === 'sbp' ? 'Телефон для СБП' : 'Номер карты'}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={busy}
                    onClick={submitWithdraw}
                  >
                    Подать заявку
                  </button>
                  <p className={styles.muted}>Рассмотрение заявки — до 5 дней.</p>
                </div>
              )}

              {data.withdrawals.length > 0 && (
                <ul className={styles.list}>
                  {data.withdrawals.map((w) => (
                    <li key={w.id}>
                      #{w.id} · {money(w.amountRub)} ₽ → {money(w.payoutAmount)} ₽ · {w.method} ·{' '}
                      {statusLabel(w.status)}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.section}>
              <h2>История</h2>
              {data.ledger.length === 0 ? (
                <p className={styles.muted}>Пока пусто</p>
              ) : (
                <ul className={styles.list}>
                  {data.ledger.map((row) => (
                    <li key={row.id}>
                      {typeLabel(row.type)} · {row.amountRub > 0 ? '+' : ''}
                      {money(row.amountRub)} ₽ · баланс {money(row.balanceAfter)} ₽
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
