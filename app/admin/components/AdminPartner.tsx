'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './AdminPartner.module.css';

type Settings = {
  commissionPercent: number;
  volumeBonusPercent: number;
  volumeThreshold: number;
  minWithdrawalRub: number;
  ndflPercent: number;
  referralMonths: number;
};

export default function AdminPartner() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'settings' | 'verifications' | 'withdrawals' | 'partners'>('withdrawals');
  const [adjUserId, setAdjUserId] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/admin/partner');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Ошибка загрузки');
        return;
      }
      setSettings(data.settings);
      setVerifications(data.verifications || []);
      setWithdrawals(data.withdrawals || []);
      setPartners(data.partners || []);
    } catch {
      setError('Ошибка сети');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async () => {
    if (!settings) return;
    setNotice('');
    const res = await fetch('/api/admin/partner', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'settings', ...settings }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Не удалось сохранить');
      return;
    }
    setSettings(data.settings);
    setNotice('Настройки сохранены');
  };

  const patchVerification = async (id: number, status: 'approved' | 'rejected') => {
    const res = await fetch('/api/admin/partner', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verification', id, status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Ошибка');
      return;
    }
    setNotice(status === 'approved' ? 'Верификация подтверждена' : 'Верификация отклонена');
    await load();
  };

  const patchWithdrawal = async (id: number, status: 'approved' | 'paid' | 'rejected') => {
    const res = await fetch('/api/admin/partner', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'withdrawal', id, status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Ошибка');
      return;
    }
    setNotice(`Заявка #${id}: ${status}`);
    await load();
  };

  const submitAdjustment = async () => {
    const res = await fetch('/api/admin/partner', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'adjustment',
        userId: Number(adjUserId),
        amountRub: Number(adjAmount.replace(',', '.')),
        note: adjNote,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Ошибка корректировки');
      return;
    }
    setNotice('Баланс скорректирован');
    setAdjAmount('');
    setAdjNote('');
    await load();
  };

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Партнерка</h1>
      <div className={styles.tabs}>
        {(
          [
            ['withdrawals', 'Выводы'],
            ['verifications', 'Верификация'],
            ['partners', 'Партнёры'],
            ['settings', 'Настройки'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`${styles.tab} ${tab === key ? styles.tabActive : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      {tab === 'settings' && settings && (
        <div className={styles.card}>
          <label>
            Комиссия %
            <input
              type="number"
              value={settings.commissionPercent}
              onChange={(e) =>
                setSettings({ ...settings, commissionPercent: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Бонус объёма %
            <input
              type="number"
              value={settings.volumeBonusPercent}
              onChange={(e) =>
                setSettings({ ...settings, volumeBonusPercent: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Порог оплативших рефералов
            <input
              type="number"
              value={settings.volumeThreshold}
              onChange={(e) =>
                setSettings({ ...settings, volumeThreshold: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Мин. вывод, ₽
            <input
              type="number"
              value={settings.minWithdrawalRub}
              onChange={(e) =>
                setSettings({ ...settings, minWithdrawalRub: Number(e.target.value) })
              }
            />
          </label>
          <label>
            НДФЛ %
            <input
              type="number"
              value={settings.ndflPercent}
              onChange={(e) => setSettings({ ...settings, ndflPercent: Number(e.target.value) })}
            />
          </label>
          <label>
            Срок жизни реферала, мес
            <input
              type="number"
              value={settings.referralMonths}
              onChange={(e) =>
                setSettings({ ...settings, referralMonths: Number(e.target.value) })
              }
            />
          </label>
          <button type="button" className={styles.button} onClick={saveSettings}>
            Сохранить
          </button>

          <hr className={styles.hr} />
          <h3>Корректировка баланса</h3>
          <label>
            User ID
            <input value={adjUserId} onChange={(e) => setAdjUserId(e.target.value)} />
          </label>
          <label>
            Сумма (+/−)
            <input value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} />
          </label>
          <label>
            Комментарий
            <input value={adjNote} onChange={(e) => setAdjNote(e.target.value)} />
          </label>
          <button type="button" className={styles.button} onClick={submitAdjustment}>
            Применить
          </button>
        </div>
      )}

      {tab === 'verifications' && (
        <div className={styles.list}>
          {verifications.length === 0 && <p>Нет заявок</p>}
          {verifications.map((v) => (
            <div key={v.id} className={styles.card}>
              <div>
                #{v.id} · user {v.partnerUserId} · {v.user?.email || v.user?.phone || '—'} ·{' '}
                {v.status}
              </div>
              <div className={styles.row}>
                <a
                  href={`/api/admin/partner/file?id=${v.id}&kind=passport`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Паспорт
                </a>
                <a
                  href={`/api/admin/partner/file?id=${v.id}&kind=inn`}
                  target="_blank"
                  rel="noreferrer"
                >
                  ИНН
                </a>
                {v.innNumber && <span>ИНН: {v.innNumber}</span>}
              </div>
              {v.status === 'pending' && (
                <div className={styles.row}>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => patchVerification(v.id, 'approved')}
                  >
                    Подтвердить
                  </button>
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    onClick={() => patchVerification(v.id, 'rejected')}
                  >
                    Отклонить
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'withdrawals' && (
        <div className={styles.list}>
          {withdrawals.length === 0 && <p>Нет заявок</p>}
          {withdrawals.map((w) => (
            <div key={w.id} className={styles.card}>
              <div>
                #{w.id} · user {w.partnerUserId} · {w.user?.email || '—'} · {w.status}
              </div>
              <div>
                С баланса: {w.amountRub} ₽ · НДФЛ {w.ndflAmount} ₽ · к переводу:{' '}
                <strong>{w.payoutAmount} ₽</strong> · {w.method}: {w.requisites}
              </div>
              <div className={styles.row}>
                {w.status === 'pending' && (
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => patchWithdrawal(w.id, 'approved')}
                  >
                    Одобрить
                  </button>
                )}
                {(w.status === 'pending' || w.status === 'approved') && (
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => patchWithdrawal(w.id, 'paid')}
                  >
                    Отметить перевели
                  </button>
                )}
                {(w.status === 'pending' || w.status === 'approved') && (
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    onClick={() => patchWithdrawal(w.id, 'rejected')}
                  >
                    Отклонить (возврат)
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'partners' && (
        <div className={styles.list}>
          {partners.map((p) => (
            <div key={p.userId} className={styles.card}>
              <div>
                user {p.userId} · {p.user?.email || p.user?.phone || '—'} · код {p.referralCode}
              </div>
              <div>
                Баланс {p.balanceRub} ₽ · KYC {p.verificationStatus} · оплативших{' '}
                {p.payingReferrals}/{p.referralsTotal}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
