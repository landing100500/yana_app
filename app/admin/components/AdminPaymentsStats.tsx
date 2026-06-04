'use client';

import { useEffect, useMemo, useState } from 'react';
import DatePicker from '@/components/ui/DatePicker';
import styles from './AdminPaymentsStats.module.css';

type Period = 'week' | 'month' | 'custom';

interface PaymentRow {
  id: number;
  paidAt: string;
  amountRub: number;
  amountValue: string;
  currency: string;
  planCode: string;
  planTitle: string;
  description: string;
  isManual?: boolean;
  yookassaPaymentId?: string | null;
  user: {
    id: number | null;
    name: string | null;
    email: string | null;
    phone: string | null;
  };
}

interface PaymentsStatsResponse {
  period: Period;
  from: string;
  to: string;
  totalAmountRub: number;
  totalPayments: number;
  totalManualAssignments?: number;
  rows: PaymentRow[];
}

function toInputDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function AdminPaymentsStats() {
  const [period, setPeriod] = useState<Period>('week');
  const [fromDate, setFromDate] = useState(() => toInputDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)));
  const [toDate, setToDate] = useState(() => toInputDate(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PaymentsStatsResponse | null>(null);

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams({ period });
    if (period === 'custom') {
      params.set('from', fromDate);
      params.set('to', toDate);
    }
    return `/api/admin/payments/stats?${params.toString()}`;
  }, [period, fromDate, toDate]);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(requestUrl);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Не удалось загрузить статистику');
        return;
      }
      setStats(data);
    } catch (err) {
      setError('Ошибка сети при загрузке статистики');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestUrl]);

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <h2 className={styles.title}>Статистика оплат тарифов</h2>
      </div>

      <div className={styles.filters}>
        <label className={styles.filterLabel}>
          Период
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className={styles.select}>
            <option value="week">Неделя</option>
            <option value="month">Месяц</option>
            <option value="custom">Выбранные даты</option>
          </select>
        </label>

        {period === 'custom' && (
          <>
            <label className={styles.filterLabel}>
              От
              <DatePicker value={fromDate} onChange={setFromDate} className={styles.datePicker} />
            </label>
            <label className={styles.filterLabel}>
              До
              <DatePicker value={toDate} onChange={setToDate} className={styles.datePicker} />
            </label>
          </>
        )}

        <button type="button" onClick={loadStats} className={styles.button} disabled={loading}>
          {loading ? 'Загрузка...' : 'Обновить'}
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {stats && (
        <div className={styles.summary}>
          <div>Успешных покупок: <strong>{stats.totalPayments}</strong></div>
          {(stats.totalManualAssignments ?? 0) > 0 && (
            <div>Добавлено вручную: <strong>{stats.totalManualAssignments}</strong></div>
          )}
          <div>Сумма за период: <strong>{stats.totalAmountRub.toLocaleString('ru-RU')} ₽</strong></div>
          <div>
            Период: <strong>{new Date(stats.from).toLocaleDateString('ru-RU')} - {new Date(stats.to).toLocaleDateString('ru-RU')}</strong>
          </div>
        </div>
      )}

      {!loading && stats && stats.rows.length === 0 ? (
        <div className={styles.empty}>За выбранный период оплат и ручных назначений нет.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Дата оплаты</th>
                <th>Пользователь</th>
                <th>Контакт</th>
                <th>За что</th>
                <th>Сумма</th>
                <th>Примечание</th>
                <th>ID платежа</th>
              </tr>
            </thead>
            <tbody>
              {(stats?.rows || []).map((row) => (
                <tr key={row.id} className={row.isManual ? styles.manualRow : undefined}>
                  <td>{new Date(row.paidAt).toLocaleString('ru-RU')}</td>
                  <td>{row.user.name || (row.user.id ? `User #${row.user.id}` : 'Удалённый пользователь')}</td>
                  <td>{row.user.email || row.user.phone || '—'}</td>
                  <td>{row.description}</td>
                  <td>{row.amountRub.toLocaleString('ru-RU')} ₽</td>
                  <td>{row.isManual ? 'Добавлен вручную' : '—'}</td>
                  <td>{row.yookassaPaymentId || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
