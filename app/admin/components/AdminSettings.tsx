'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from '../page.module.css';

export default function AdminSettings() {
  const [limit, setLimit] = useState<number>(6);
  const [draft, setDraft] = useState('6');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Ошибка загрузки');
        return;
      }
      const n = Number(data.freeAiRequestsForNewUsers);
      const value = Number.isFinite(n) ? Math.floor(n) : 6;
      setLimit(value);
      setDraft(String(value));
    } catch {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const n = Number.parseInt(draft, 10);
      if (!Number.isFinite(n) || n < 0) {
        setError('Укажите целое число ≥ 0');
        return;
      }
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ freeAiRequestsForNewUsers: n }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Не удалось сохранить');
        return;
      }
      const saved = Number(data.freeAiRequestsForNewUsers);
      const value = Number.isFinite(saved) ? Math.floor(saved) : n;
      setLimit(value);
      setDraft(String(value));
      setNotice('Сохранено. Действует только для новых регистраций.');
    } catch {
      setError('Ошибка сети');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.adminPanel}>
      <h1 className={styles.title}>Настройки</h1>
      <p className={styles.subtitle}>
        Параметры сервиса. Число ниже — сколько получают новые регистрации, и оно же
        показывается в тарифах / meta («N запросов к ИИ»). У уже существующих пользователей
        лимит не меняется.
      </p>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Бесплатные запросы к ИИ</h2>
        <label className={styles.hint} htmlFor="free-ai-limit" style={{ display: 'block', marginBottom: '0.5rem' }}>
          Количество запросов для новых зарегистрированных
        </label>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            id="free-ai-limit"
            className={styles.input}
            type="number"
            min={0}
            step={1}
            value={draft}
            disabled={loading || saving}
            onChange={(e) => setDraft(e.target.value)}
            style={{ maxWidth: '8rem' }}
          />
          <button
            type="button"
            className={styles.button}
            disabled={loading || saving || draft === String(limit)}
            onClick={() => void save()}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
        {(loading || saving) && (
          <p className={styles.hint}>{saving ? 'Сохранение…' : 'Загрузка…'}</p>
        )}
        {notice && <p className={styles.hint}>{notice}</p>}
        {error && <div className={styles.error}>{error}</div>}
      </div>
    </div>
  );
}
