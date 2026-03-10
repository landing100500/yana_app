'use client';

import { useState, useEffect, Fragment } from 'react';
import styles from './AdminChatHistory.module.css';

interface SectionRef {
  id: string;
  name: string;
}

interface HistoryItem {
  id: number;
  createdAt: string;
  userId: number;
  userDisplay: string;
  userPhone: string;
  topicId: number;
  topicTitle: string;
  sectionRefs: SectionRef[];
  messages: { role: string; content: string; createdAt: string }[];
}

export default function AdminChatHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/chat-history');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
        if (!cancelled) setItems(data.items || []);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Ошибка');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const formatDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) return <div className={styles.wrap}><div className={styles.loading}>Загрузка...</div></div>;
  if (error) return <div className={styles.wrap}><div className={styles.error}>{error}</div></div>;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>История запросов чата</h1>
      <p className={styles.subtitle}>
        Показаны запросы к ИИ, области памяти, к которым обращался агент, и история переписки по топику.
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Пользователь</th>
              <th>Топик</th>
              <th>Области памяти</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <Fragment key={item.id}>
                <tr
                  className={styles.row}
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                >
                  <td className={styles.cellDate}>{formatDate(item.createdAt)}</td>
                  <td>
                    <span className={styles.userName}>{item.userDisplay}</span>
                    {item.userPhone && <span className={styles.userPhone}>{item.userPhone}</span>}
                  </td>
                  <td className={styles.cellTopic}>{item.topicTitle || `Топик #${item.topicId}`}</td>
                  <td>
                    {item.sectionRefs.length > 0 ? (
                      <ul className={styles.sectionList}>
                        {item.sectionRefs.map((s) => (
                          <li key={s.id}>{s.name}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className={styles.noSections}>— не использовались</span>
                    )}
                  </td>
                  <td className={styles.expandBtn}>{expandedId === item.id ? '▼' : '▶'}</td>
                </tr>
                {expandedId === item.id && (
                  <tr>
                    <td colSpan={5} className={styles.detailCell}>
                      <div className={styles.detailTitle}>История переписки (топик)</div>
                      <div className={styles.messages}>
                        {item.messages.map((msg, idx) => (
                          <div
                            key={idx}
                            className={msg.role === 'user' ? styles.msgUser : styles.msgAssistant}
                          >
                            <span className={styles.msgRole}>{msg.role === 'user' ? 'Пользователь' : 'ИИ'}</span>
                            <div className={styles.msgContent}>{msg.content}</div>
                            <span className={styles.msgTime}>
                              {formatDate(msg.createdAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {items.length === 0 && (
        <div className={styles.empty}>Запросов пока нет.</div>
      )}
    </div>
  );
}
