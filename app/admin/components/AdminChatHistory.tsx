'use client';

import { useState, useEffect, Fragment, useCallback } from 'react';
import styles from './AdminChatHistory.module.css';
import AdminPagination from './AdminPagination';

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
}

interface TopicMessage {
  role: string;
  content: string;
  createdAt: string;
}

export default function AdminChatHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedTopicId, setExpandedTopicId] = useState<number | null>(null);
  const [messages, setMessages] = useState<TopicMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const loadHistory = useCallback(async (targetPage = page) => {
    const isFirst = items.length === 0 && loading;
    try {
      if (isFirst) setLoading(true);
      else setTableLoading(true);
      setError(null);

      const res = await fetch(`/api/admin/chat-history?page=${targetPage}&limit=30`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');

      setItems(data.items || []);
      setPage(data.page || targetPage);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
      setTableLoading(false);
    }
  }, [page, items.length, loading]);

  useEffect(() => {
    loadHistory(page);
  }, [page, loadHistory]);

  const loadTopicMessages = async (topicId: number) => {
    try {
      setMessagesLoading(true);
      const res = await fetch(`/api/admin/chat-history/${topicId}/messages`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки сообщений');
      setMessages(data.messages || []);
    } catch (e: unknown) {
      setMessages([]);
      setError(e instanceof Error ? e.message : 'Ошибка загрузки сообщений');
    } finally {
      setMessagesLoading(false);
    }
  };

  const toggleExpand = async (item: HistoryItem) => {
    if (expandedId === item.id) {
      setExpandedId(null);
      setExpandedTopicId(null);
      setMessages([]);
      return;
    }
    setExpandedId(item.id);
    setExpandedTopicId(item.topicId);
    await loadTopicMessages(item.topicId);
  };

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

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>История запросов чата</h1>
      <p className={styles.subtitle}>
        Показаны запросы к ИИ, области памяти, к которым обращался агент, и история переписки по топику.
      </p>

      {error && <div className={styles.error}>{error}</div>}
      {tableLoading && <div className={styles.loading}>Обновление...</div>}

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
                <tr className={styles.row} onClick={() => toggleExpand(item)}>
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
                      {messagesLoading && expandedTopicId === item.topicId ? (
                        <div className={styles.loading}>Загрузка сообщений...</div>
                      ) : (
                        <div className={styles.messages}>
                          {messages.map((msg, idx) => (
                            <div
                              key={idx}
                              className={msg.role === 'user' ? styles.msgUser : styles.msgAssistant}
                            >
                              <span className={styles.msgRole}>{msg.role === 'user' ? 'Пользователь' : 'ИИ'}</span>
                              <div className={styles.msgContent}>{msg.content}</div>
                              <span className={styles.msgTime}>{formatDate(msg.createdAt)}</span>
                            </div>
                          ))}
                          {messages.length === 0 && !messagesLoading && (
                            <div className={styles.noSections}>Сообщений нет</div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.noSections}>Записей нет</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={total}
        loading={tableLoading}
        onPageChange={setPage}
      />
    </div>
  );
}
