'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './AdminTrialEnd.module.css';

type GenderedText = { male: string; female: string };
type Templates = {
  part1: Record<string, GenderedText>;
  part2: Record<string, GenderedText>;
  part3: string;
};

type HistoryItem = {
  id: number;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  lagnaSignName: string;
  lagneshaHouse: number;
  lagneshaPlanet: string;
  gender: string;
  chatSent: boolean;
  emailSent: boolean;
  sentAt: string;
};

type HistoryDetail = HistoryItem & {
  bodyText: string;
  emailError: string | null;
  topicId: number | null;
  lagnaSign: number;
};

const SIGN_NAMES = [
  'Овен',
  'Телец',
  'Близнецы',
  'Рак',
  'Лев',
  'Дева',
  'Весы',
  'Скорпион',
  'Стрелец',
  'Козерог',
  'Водолей',
  'Рыбы',
];

type Tab = 'formulas' | 'history';

export default function AdminTrialEnd() {
  const [tab, setTab] = useState<Tab>('formulas');
  const [enabled, setEnabled] = useState(false);
  const [templates, setTemplates] = useState<Templates | null>(null);
  const [house, setHouse] = useState('1');
  const [sign, setSign] = useState('0');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const [historyQ, setHistoryQ] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [detail, setDetail] = useState<HistoryDetail | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/trial-end');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
      setEnabled(!!data.enabled);
      setTemplates(data.templates);
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (page: number, q: string) => {
    setHistoryLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/admin/trial-end/history?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка истории');
      setHistoryItems(data.items || []);
      setHistoryTotal(data.total || 0);
      setHistoryPage(data.page || page);
    } catch (e: any) {
      setError(e?.message || 'Ошибка истории');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (tab === 'history' && !detail) {
      loadHistory(historyPage, historyQ);
    }
    // historyQ применяется по кнопке «Найти» / Enter — не на каждый символ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, detail, historyPage, loadHistory]);

  const toggleEnabled = async (next: boolean) => {
    setToggling(true);
    setError('');
    setStatus('');
    try {
      const res = await fetch('/api/admin/trial-end', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить');
      setEnabled(!!data.enabled);
      setStatus(next ? 'Опция включена' : 'Опция выключена');
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setToggling(false);
    }
  };

  const saveTemplates = async () => {
    if (!templates) return;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const res = await fetch('/api/admin/trial-end', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить');
      setTemplates(data.templates);
      setStatus('Формулы сохранены');
    } catch (e: any) {
      setError(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (id: number) => {
    setHistoryLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/trial-end/history?id=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не найдено');
      setDetail(data.item);
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setHistoryLoading(false);
    }
  };

  const updatePart1 = (gender: 'male' | 'female', value: string) => {
    if (!templates) return;
    setTemplates({
      ...templates,
      part1: {
        ...templates.part1,
        [house]: {
          ...templates.part1[house],
          [gender]: value,
        },
      },
    });
  };

  const updatePart2 = (gender: 'male' | 'female', value: string) => {
    if (!templates) return;
    setTemplates({
      ...templates,
      part2: {
        ...templates.part2,
        [sign]: {
          ...templates.part2[sign],
          [gender]: value,
        },
      },
    });
  };

  if (loading || !templates) {
    return <div className={styles.wrap}><p className={styles.hint}>Загрузка…</p></div>;
  }

  const part1 = templates.part1[house] || { male: '', female: '' };
  const part2 = templates.part2[sign] || { male: '', female: '' };
  const totalPages = Math.max(1, Math.ceil(historyTotal / 20));

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>Завершение пробного</h1>
        <p className={styles.subtitle}>
          Персональное сообщение в чат и на почту после 10 бесплатных запросов
        </p>
      </div>

      <div className={styles.enableRow}>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            disabled={toggling}
            onChange={(e) => toggleEnabled(e.target.checked)}
          />
          Активировать опцию
        </label>
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'formulas' ? styles.tabActive : ''}`}
          onClick={() => {
            setTab('formulas');
            setDetail(null);
          }}
        >
          Формулы
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'history' ? styles.tabActive : ''}`}
          onClick={() => setTab('history')}
        >
          История отправленных
        </button>
      </div>

      {tab === 'formulas' && (
        <div className={styles.section}>
          <div className={styles.block}>
            <h2 className={styles.sectionTitle}>1. Область интересов (дом лагнеши)</h2>
            <p className={styles.hint}>Дом, в котором стоит управитель восходящего знака</p>
            <div className={styles.row}>
              <select className={styles.select} value={house} onChange={(e) => setHouse(e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => (
                  <option key={h} value={h}>
                    {h} дом
                  </option>
                ))}
              </select>
            </div>
            <label className={styles.fieldLabel}>Мужской</label>
            <textarea
              className={styles.textarea}
              value={part1.male}
              onChange={(e) => updatePart1('male', e.target.value)}
            />
            <label className={styles.fieldLabel}>Женский</label>
            <textarea
              className={styles.textarea}
              value={part1.female}
              onChange={(e) => updatePart1('female', e.target.value)}
            />
          </div>

          <div className={styles.block}>
            <h2 className={styles.sectionTitle}>2. Амбиции (восходящий знак)</h2>
            <div className={styles.row}>
              <select className={styles.select} value={sign} onChange={(e) => setSign(e.target.value)}>
                {SIGN_NAMES.map((name, i) => (
                  <option key={name} value={String(i)}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <label className={styles.fieldLabel}>Мужской</label>
            <textarea
              className={styles.textarea}
              value={part2.male}
              onChange={(e) => updatePart2('male', e.target.value)}
            />
            <label className={styles.fieldLabel}>Женский</label>
            <textarea
              className={styles.textarea}
              value={part2.female}
              onChange={(e) => updatePart2('female', e.target.value)}
            />
          </div>

          <div className={styles.block}>
            <h2 className={styles.sectionTitle}>3. Концовка (одна на всех)</h2>
            <textarea
              className={styles.textareaTall}
              value={templates.part3}
              onChange={(e) => setTemplates({ ...templates, part3: e.target.value })}
            />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.button} disabled={saving} onClick={saveTemplates}>
              {saving ? 'Сохранение…' : 'Сохранить формулы'}
            </button>
            {status && <span className={styles.status}>{status}</span>}
          </div>
        </div>
      )}

      {tab === 'history' && !detail && (
        <div className={styles.section}>
          <div className={styles.searchRow}>
            <input
              className={styles.searchInput}
              placeholder="Поиск по email / телефону / имени"
              value={historyQ}
              onChange={(e) => setHistoryQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setHistoryPage(1);
                  loadHistory(1, historyQ);
                }
              }}
            />
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                setHistoryPage(1);
                loadHistory(1, historyQ);
              }}
            >
              Найти
            </button>
          </div>

          {historyLoading ? (
            <p className={styles.hint}>Загрузка…</p>
          ) : historyItems.length === 0 ? (
            <p className={styles.hint}>Пока нет отправленных писем</p>
          ) : (
            <>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Когда</th>
                    <th>Пользователь</th>
                    <th>Карта</th>
                    <th>Каналы</th>
                  </tr>
                </thead>
                <tbody>
                  {historyItems.map((item) => (
                    <tr key={item.id} onClick={() => openDetail(item.id)}>
                      <td>{new Date(item.sentAt).toLocaleString('ru-RU')}</td>
                      <td>
                        {item.userName || '—'}
                        <br />
                        <span style={{ opacity: 0.65 }}>{item.userEmail || item.userPhone || `id ${item.userId}`}</span>
                      </td>
                      <td>
                        {item.lagnaSignName}, {item.lagneshaPlanet} в {item.lagneshaHouse} ·{' '}
                        {item.gender === 'female' ? 'Ж' : 'М'}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${item.chatSent ? styles.badgeOk : styles.badgeFail}`}>
                          чат
                        </span>
                        <span className={`${styles.badge} ${item.emailSent ? styles.badgeOk : styles.badgeFail}`}>
                          почта
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={styles.pager}>
                <button
                  type="button"
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                >
                  ←
                </button>
                <span>
                  {historyPage} / {totalPages} ({historyTotal})
                </span>
                <button
                  type="button"
                  disabled={historyPage >= totalPages}
                  onClick={() => setHistoryPage((p) => p + 1)}
                >
                  →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'history' && detail && (
        <div className={styles.section}>
          <button type="button" className={styles.detailBack} onClick={() => setDetail(null)}>
            ← К списку
          </button>
          <div className={styles.meta}>
            <div>
              <strong>{detail.userName || 'Без имени'}</strong>
              {' · '}
              {detail.userEmail || detail.userPhone || `user #${detail.userId}`}
            </div>
            <div>
              {detail.lagnaSignName}, лагнеша {detail.lagneshaPlanet} в {detail.lagneshaHouse} доме ·{' '}
              {detail.gender === 'female' ? 'женский' : 'мужской'}
            </div>
            <div>
              {new Date(detail.sentAt).toLocaleString('ru-RU')}
              {' · '}
              чат: {detail.chatSent ? 'да' : 'нет'}
              {' · '}
              почта: {detail.emailSent ? 'да' : `нет${detail.emailError ? ` (${detail.emailError})` : ''}`}
              {detail.topicId ? ` · topic #${detail.topicId}` : ''}
            </div>
          </div>
          <div className={styles.letterBody}>{detail.bodyText}</div>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
      {status && tab === 'history' && <div className={styles.status}>{status}</div>}
    </div>
  );
}
