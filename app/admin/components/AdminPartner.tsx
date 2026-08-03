'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminPagination from './AdminPagination';
import styles from './AdminPartner.module.css';

type Settings = {
  commissionPercent: number;
  volumeBonusPercent: number;
  volumeThreshold: number;
  minWithdrawalRub: number;
  ndflPercent: number;
  referralMonths: number;
};

type Tab = 'withdrawals' | 'verifications' | 'partners' | 'settings';

function money(n: number) {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
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

export default function AdminPartner() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<Tab>('withdrawals');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const [verifications, setVerifications] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('open');
  const [partnerQuery, setPartnerQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  const [adjUserId, setAdjUserId] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');

  const [createUserId, setCreateUserId] = useState('');
  const [createCode, setCreateCode] = useState('');

  const [editPartner, setEditPartner] = useState<any | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editKyc, setEditKyc] = useState('none');

  const [ledgerUserId, setLedgerUserId] = useState<number | null>(null);
  const [ledgerRows, setLedgerRows] = useState<any[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerTotalPages, setLedgerTotalPages] = useState(1);
  const [ledgerTotal, setLedgerTotal] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(partnerQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [partnerQuery]);

  useEffect(() => {
    setPage(1);
  }, [tab, statusFilter, debouncedQ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ tab, page: String(page), limit: '50' });
      if (tab === 'withdrawals') params.set('status', statusFilter);
      if (tab === 'verifications') params.set('status', statusFilter === 'open' ? 'pending' : statusFilter);
      if (tab === 'partners' && debouncedQ) params.set('q', debouncedQ);

      const res = await fetch(`/api/admin/partner?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Ошибка загрузки');
        return;
      }
      if (data.settings) setSettings(data.settings);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);

      if (tab === 'partners') setPartners(data.partners || []);
      if (tab === 'verifications') setVerifications(data.verifications || []);
      if (tab === 'withdrawals') setWithdrawals(data.withdrawals || []);
      if (tab === 'settings' && data.settings) setSettings(data.settings);
    } catch {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  }, [tab, page, statusFilter, debouncedQ]);

  useEffect(() => {
    load();
  }, [load]);

  const loadLedger = useCallback(async (userId: number, p = 1) => {
    const res = await fetch(`/api/admin/partner?tab=ledger&userId=${userId}&page=${p}&limit=50`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Не удалось загрузить историю');
      return;
    }
    setLedgerUserId(userId);
    setLedgerRows(data.rows || []);
    setLedgerPage(data.page || 1);
    setLedgerTotalPages(data.totalPages || 1);
    setLedgerTotal(data.total || 0);
  }, []);

  const patch = async (body: Record<string, unknown>, okMsg: string) => {
    setError('');
    setNotice('');
    const res = await fetch('/api/admin/partner', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Ошибка');
      return false;
    }
    setNotice(okMsg);
    return true;
  };

  const saveSettings = async () => {
    if (!settings) return;
    const ok = await patch({ action: 'settings', ...settings }, 'Настройки сохранены');
    if (ok && settings) setSettings({ ...settings });
  };

  const createPartner = async () => {
    const ok = await patch(
      {
        action: 'create_partner',
        userId: Number(createUserId),
        referralCode: createCode.trim() || undefined,
      },
      'Партнёр создан'
    );
    if (ok) {
      setCreateUserId('');
      setCreateCode('');
      setTab('partners');
      await load();
    }
  };

  const saveEditPartner = async () => {
    if (!editPartner) return;
    const ok = await patch(
      {
        action: 'update_partner',
        userId: editPartner.userId,
        referralCode: editCode,
        verificationStatus: editKyc,
      },
      'Партнёр обновлён'
    );
    if (ok) {
      setEditPartner(null);
      await load();
    }
  };

  const regenerateCode = async (userId: number) => {
    const ok = await patch(
      { action: 'update_partner', userId, regenerateCode: true },
      'Код обновлён'
    );
    if (ok) await load();
  };

  const deletePartner = async (userId: number) => {
    if (
      !confirm(
        'Удалить партнёра? История движений баланса сохранится. Реф-привязки будут сняты.'
      )
    ) {
      return;
    }
    const ok = await patch({ action: 'delete_partner', userId }, 'Партнёр удалён');
    if (ok) await load();
  };

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Партнерка</h1>
      <p className={styles.subtitle}>
        Выводы, верификация, партнёры и настройки. История баланса не удаляется.
      </p>

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
            onClick={() => {
              setTab(key);
              if (key === 'withdrawals') setStatusFilter('open');
              else if (key === 'verifications') setStatusFilter('open');
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}
      {loading && <p className={styles.meta}>Загрузка…</p>}

      {tab === 'settings' && settings && (
        <div className={styles.card}>
          <h3>Параметры программы</h3>
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
          <p className={styles.meta}>Пишется в неизменяемый ledger как adjustment.</p>
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
          <button
            type="button"
            className={styles.button}
            onClick={async () => {
              const ok = await patch(
                {
                  action: 'adjustment',
                  userId: Number(adjUserId),
                  amountRub: Number(adjAmount.replace(',', '.')),
                  note: adjNote,
                },
                'Баланс скорректирован'
              );
              if (ok) {
                setAdjAmount('');
                setAdjNote('');
              }
            }}
          >
            Применить
          </button>
        </div>
      )}

      {tab === 'verifications' && (
        <>
          <div className={styles.toolbar}>
            <label>
              Статус
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="open">Ожидают</option>
                <option value="pending">pending</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
                <option value="all">Все</option>
              </select>
            </label>
          </div>
          <div className={styles.list}>
            {verifications.length === 0 && !loading && <p className={styles.meta}>Нет заявок</p>}
            {verifications.map((v) => (
              <div key={v.id} className={styles.card}>
                <div>
                  #{v.id} · user {v.partnerUserId} · {v.user?.email || v.user?.phone || '—'}{' '}
                  <span className={styles.statusChip}>{v.status}</span>
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
                  {v.innNumber && <span className={styles.meta}>ИНН: {v.innNumber}</span>}
                </div>
                {v.status === 'pending' && (
                  <div className={styles.row}>
                    <button
                      type="button"
                      className={styles.buttonSuccess}
                      onClick={async () => {
                        const ok = await patch(
                          { action: 'verification', id: v.id, status: 'approved' },
                          'Верификация подтверждена'
                        );
                        if (ok) await load();
                      }}
                    >
                      Подтвердить
                    </button>
                    <button
                      type="button"
                      className={styles.buttonDanger}
                      onClick={async () => {
                        const ok = await patch(
                          { action: 'verification', id: v.id, status: 'rejected' },
                          'Верификация отклонена'
                        );
                        if (ok) await load();
                      }}
                    >
                      Отклонить
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <AdminPagination
            page={page}
            totalPages={totalPages}
            total={total}
            loading={loading}
            onPageChange={setPage}
          />
        </>
      )}

      {tab === 'withdrawals' && (
        <>
          <div className={styles.toolbar}>
            <label>
              Статус
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="open">Открытые</option>
                <option value="pending">pending</option>
                <option value="approved">approved</option>
                <option value="paid">paid</option>
                <option value="rejected">rejected</option>
                <option value="all">Все</option>
              </select>
            </label>
          </div>
          <div className={styles.list}>
            {withdrawals.length === 0 && !loading && <p className={styles.meta}>Нет заявок</p>}
            {withdrawals.map((w) => (
              <div key={w.id} className={styles.card}>
                <div>
                  #{w.id} · user {w.partnerUserId} · {w.user?.email || '—'}{' '}
                  <span className={styles.statusChip}>{w.status}</span>
                </div>
                <div className={styles.meta}>
                  С баланса: {money(w.amountRub)} ₽ · НДФЛ {money(w.ndflAmount)} ₽ · к переводу:{' '}
                  <strong>{money(w.payoutAmount)} ₽</strong> · {w.method}: {w.requisites}
                </div>
                <div className={styles.row}>
                  {w.status === 'pending' && (
                    <button
                      type="button"
                      className={styles.buttonWarn}
                      onClick={async () => {
                        const ok = await patch(
                          { action: 'withdrawal', id: w.id, status: 'approved' },
                          `Заявка #${w.id} одобрена`
                        );
                        if (ok) await load();
                      }}
                    >
                      Одобрить
                    </button>
                  )}
                  {(w.status === 'pending' || w.status === 'approved') && (
                    <button
                      type="button"
                      className={styles.buttonSuccess}
                      onClick={async () => {
                        const ok = await patch(
                          { action: 'withdrawal', id: w.id, status: 'paid' },
                          `Заявка #${w.id}: переведено`
                        );
                        if (ok) await load();
                      }}
                    >
                      Отметить перевели
                    </button>
                  )}
                  {(w.status === 'pending' || w.status === 'approved') && (
                    <button
                      type="button"
                      className={styles.buttonDanger}
                      onClick={async () => {
                        const ok = await patch(
                          { action: 'withdrawal', id: w.id, status: 'rejected' },
                          `Заявка #${w.id} отклонена, баланс возвращён`
                        );
                        if (ok) await load();
                      }}
                    >
                      Отклонить (возврат)
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <AdminPagination
            page={page}
            totalPages={totalPages}
            total={total}
            loading={loading}
            onPageChange={setPage}
          />
        </>
      )}

      {tab === 'partners' && (
        <>
          <div className={styles.card}>
            <h3>Добавить партнёра</h3>
            <div className={styles.row}>
              <label>
                User ID
                <input
                  value={createUserId}
                  onChange={(e) => setCreateUserId(e.target.value)}
                  placeholder="ID пользователя"
                />
              </label>
              <label>
                Реф-код (опц.)
                <input
                  value={createCode}
                  onChange={(e) => setCreateCode(e.target.value)}
                  placeholder="авто, если пусто"
                />
              </label>
              <button type="button" className={styles.button} onClick={createPartner}>
                Создать
              </button>
            </div>
          </div>

          <div className={styles.toolbar}>
            <label>
              Поиск
              <input
                value={partnerQuery}
                onChange={(e) => setPartnerQuery(e.target.value)}
                placeholder="email / телефон / код / id"
              />
            </label>
          </div>

          <div className={styles.list}>
            {partners.length === 0 && !loading && <p className={styles.meta}>Нет партнёров</p>}
            {partners.map((p) => (
              <div key={p.userId} className={styles.card}>
                <div>
                  user {p.userId} · {p.user?.email || p.user?.phone || '—'} · код{' '}
                  <strong>{p.referralCode}</strong>{' '}
                  <span className={styles.statusChip}>{p.verificationStatus}</span>
                </div>
                <div className={styles.meta}>
                  Баланс {money(p.balanceRub)} ₽ · оплативших {p.payingReferrals}/
                  {p.referralsTotal}
                </div>
                <div className={styles.row}>
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    onClick={() => {
                      setEditPartner(p);
                      setEditCode(p.referralCode);
                      setEditKyc(p.verificationStatus);
                    }}
                  >
                    Редактировать
                  </button>
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    onClick={() => regenerateCode(p.userId)}
                  >
                    Новый код
                  </button>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => loadLedger(p.userId, 1)}
                  >
                    История баланса
                  </button>
                  <button
                    type="button"
                    className={styles.buttonDanger}
                    onClick={() => deletePartner(p.userId)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
          <AdminPagination
            page={page}
            totalPages={totalPages}
            total={total}
            loading={loading}
            onPageChange={setPage}
          />
        </>
      )}

      {editPartner && (
        <div className={styles.modalOverlay} onClick={() => setEditPartner(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Редактировать партнёра #{editPartner.userId}</h3>
            <label>
              Реф-код
              <input value={editCode} onChange={(e) => setEditCode(e.target.value)} />
            </label>
            <label>
              KYC статус
              <select value={editKyc} onChange={(e) => setEditKyc(e.target.value)}>
                <option value="none">none</option>
                <option value="pending">pending</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
              </select>
            </label>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={() => setEditPartner(null)}
              >
                Отмена
              </button>
              <button type="button" className={styles.button} onClick={saveEditPartner}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {ledgerUserId != null && (
        <div className={styles.modalOverlay} onClick={() => setLedgerUserId(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>История баланса · user {ledgerUserId}</h3>
            <p className={styles.meta}>Неудаляемый журнал ({ledgerTotal} записей)</p>
            <table className={styles.ledgerTable}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Тип</th>
                  <th>Сумма</th>
                  <th>Баланс</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{typeLabel(row.type)}</td>
                    <td className={row.amountRub >= 0 ? styles.amountPlus : styles.amountMinus}>
                      {row.amountRub > 0 ? '+' : ''}
                      {money(row.amountRub)}
                    </td>
                    <td>{money(row.balanceAfter)}</td>
                    <td>{new Date(row.createdAt).toLocaleString('ru-RU')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <AdminPagination
              page={ledgerPage}
              totalPages={ledgerTotalPages}
              total={ledgerTotal}
              onPageChange={(p) => loadLedger(ledgerUserId, p)}
            />
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={() => setLedgerUserId(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
