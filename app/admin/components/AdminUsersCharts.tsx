'use client';

import { useState, useEffect } from 'react';
import styles from './AdminUsersCharts.module.css';
import NatalChartVisualization from '@/components/NatalChartVisualization';

interface User {
  id: number;
  email?: string | null;
  phone?: string | null;
  name: string;
  tariff: string;
  planCode?: 'free' | 'optimal' | 'professional';
  planExpiresAt?: string | null;
  createdAt: string;
  chartCount: number;
  lastVisitAt?: string | null;
}

interface Chart {
  id: number;
  name: string;
  chartDate: string;
  chartTime: string;
  chartCity: string;
  createdAt: string;
  createdByAdmin?: boolean;
}

interface ChartData {
  id: number;
  name: string;
  chartDate: string;
  chartTime: string;
  chartCity: string;
  sun: number;
  moon: number;
  mercury: number;
  venus: number;
  mars: number;
  jupiter: number;
  saturn: number;
  uranus: number;
  neptune: number;
  pluto: number;
  northNode: number;
  southNode: number;
  ascendant: number;
  midheaven: number;
  house1: number;
  house2: number;
  house3: number;
  house4: number;
  house5: number;
  house6: number;
  house7: number;
  house8: number;
  house9: number;
  house10: number;
  house11: number;
  house12: number;
  createdAt: string;
  dashas?: any[];
}

export default function AdminUsersCharts() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [charts, setCharts] = useState<Chart[]>([]);
  const [selectedChart, setSelectedChart] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingCharts, setLoadingCharts] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    name: '',
    gender: 'female',
    birthDate: '',
    birthTime: '',
    birthPlace: '',
  });
  const [adminCharts, setAdminCharts] = useState<Chart[]>([]);
  const [loadingAdminCharts, setLoadingAdminCharts] = useState(false);
  const [selectedAdminChartId, setSelectedAdminChartId] = useState<number | null>(null);
  const [updatingPlanUserId, setUpdatingPlanUserId] = useState<number | null>(null);

  useEffect(() => {
    loadUsers();
    loadAdminCharts();
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      loadUserCharts(selectedUserId);
    } else {
      setCharts([]);
      if (!selectedAdminChartId) setSelectedChart(null);
    }
  }, [selectedUserId, selectedAdminChartId]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/users');
      const data = await response.json();

      if (response.ok) {
        setUsers(data.users || []);
      } else {
        setError(data.error || 'Ошибка при загрузке пользователей');
      }
    } catch (err: any) {
      setError('Ошибка при загрузке пользователей');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadUserCharts = async (userId: number) => {
    try {
      setLoadingCharts(true);
      setError(null);
      const response = await fetch(`/api/admin/users/${userId}/charts`);
      const data = await response.json();

      if (response.ok) {
        setSelectedUser(data.user);
        setCharts(data.charts || []);
        setSelectedChart(null);
      } else {
        setError(data.error || 'Ошибка при загрузке карт');
      }
    } catch (err: any) {
      setError('Ошибка при загрузке карт');
      console.error(err);
    } finally {
      setLoadingCharts(false);
    }
  };

  const loadAdminCharts = async () => {
    try {
      setLoadingAdminCharts(true);
      const response = await fetch('/api/admin/admin-natal-charts');
      const data = await response.json();
      if (response.ok) setAdminCharts(data.charts || []);
    } catch {
      setAdminCharts([]);
    } finally {
      setLoadingAdminCharts(false);
    }
  };

  const loadChart = async (chartId: number) => {
    try {
      setLoadingChart(true);
      setError(null);
      const response = await fetch(`/api/admin/charts/${chartId}`);
      const data = await response.json();

      if (response.ok) {
        setSelectedChart(data.chart);
      } else {
        setError(data.error || 'Ошибка при загрузке карты');
      }
    } catch (err: any) {
      setError('Ошибка при загрузке карты');
      console.error(err);
    } finally {
      setLoadingChart(false);
    }
  };

  const handleUserClick = (userId: number) => {
    setSelectedUserId(userId);
  };

  const handleChartClick = (chartId: number) => {
    setSelectedAdminChartId(null);
    loadChart(chartId);
  };

  const loadAdminChart = async (id: number) => {
    try {
      setLoadingChart(true);
      setError(null);
      const response = await fetch(`/api/admin/admin-natal-charts/${id}`);
      const data = await response.json();
      if (response.ok) {
        setSelectedChart(data.chart);
        setSelectedAdminChartId(id);
      } else {
        setError(data.error || 'Ошибка при загрузке карты');
      }
    } catch (err: any) {
      setError('Ошибка при загрузке карты');
    } finally {
      setLoadingChart(false);
    }
  };

  const handleAdminChartClick = (chartId: number) => {
    loadAdminChart(chartId);
  };

  const handleBack = () => {
    if (selectedChart) {
      setSelectedChart(null);
      setSelectedAdminChartId(null);
    } else if (selectedUserId) {
      setSelectedUserId(null);
      setSelectedUser(null);
      setCharts([]);
    }
  };

  const handlePlanChange = async (userId: number, planCode: 'free' | 'optimal' | 'professional') => {
    try {
      setUpdatingPlanUserId(userId);
      const response = await fetch(`/api/admin/users/${userId}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(data.error || 'Не удалось обновить тариф');
        return;
      }
      await loadUsers();
    } catch (err) {
      alert('Ошибка сети при обновлении тарифа');
    } finally {
      setUpdatingPlanUserId(null);
    }
  };

  const handleCreateChartSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.birthDate || !createForm.birthTime || !createForm.birthPlace.trim()) {
      setCreateError('Заполните все поля');
      return;
    }
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const response = await fetch('/api/admin/natal-chart/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          birthDate: createForm.birthDate,
          birthTime: createForm.birthTime,
          birthPlace: createForm.birthPlace.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setCreateError(data.error || 'Ошибка при создании карты');
        return;
      }
      setModalOpen(false);
      setCreateForm({ name: '', gender: 'female', birthDate: '', birthTime: '', birthPlace: '' });
      loadAdminCharts();
    } catch (err: any) {
      setCreateError(err.message || 'Ошибка сети');
    } finally {
      setCreateSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Загрузка пользователей...</div>
      </div>
    );
  }

  if (selectedChart) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <button onClick={handleBack} className={styles.backButton}>
            ← Назад {selectedAdminChartId ? 'к списку карт из админки' : ''}
          </button>
          <h1 className={styles.title}>Карта: {selectedChart.name}</h1>
        </div>
        {loadingChart ? (
          <div className={styles.loading}>Загрузка карты...</div>
        ) : (
          <div className={styles.chartContainer}>
            <NatalChartVisualization chart={selectedChart} chartId={selectedChart.id} />
          </div>
        )}
      </div>
    );
  }

  if (selectedUserId && selectedUser) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <button onClick={handleBack} className={styles.backButton}>
            ← Назад к списку пользователей
          </button>
          <h1 className={styles.title}>
            Карты пользователя: {selectedUser.name} ({selectedUser.email || selectedUser.phone || 'без контакта'})
          </h1>
        </div>
        {loadingCharts ? (
          <div className={styles.loading}>Загрузка карт...</div>
        ) : charts.length === 0 ? (
          <div className={styles.empty}>У пользователя нет карт</div>
        ) : (
          <>
            <div className={styles.chartsList}>
              {charts.map((chart) => (
                <div
                  key={chart.id}
                  className={styles.chartCard}
                  onClick={() => handleChartClick(chart.id)}
                >
                  <div className={styles.chartCardHeader}>
                    <div className={styles.chartCardUserRow}>
                      <span className={styles.chartCardUserName}>{selectedUser?.name}</span>
                      <span className={styles.chartCardUserPhone}>{selectedUser?.phone}</span>
                    </div>
                    <span className={chart.createdByAdmin ? styles.badgeAdmin : styles.badgeUser}>
                      {chart.createdByAdmin ? 'Создана в админке' : 'При входе в сервис'}
                    </span>
                    <h3 className={styles.chartCardTitle}>{chart.name}</h3>
                  </div>
                  <div className={styles.chartCardInfo}>
                    <div className={styles.chartCardRow}>
                      <span className={styles.chartCardLabel}>Дата:</span>
                      <span className={styles.chartCardValue}>{chart.chartDate}</span>
                    </div>
                    <div className={styles.chartCardRow}>
                      <span className={styles.chartCardLabel}>Время:</span>
                      <span className={styles.chartCardValue}>{chart.chartTime}</span>
                    </div>
                    <div className={styles.chartCardRow}>
                      <span className={styles.chartCardLabel}>Город:</span>
                      <span className={styles.chartCardValue}>{chart.chartCity}</span>
                    </div>
                    <div className={styles.chartCardRow}>
                      <span className={styles.chartCardLabel}>Создана:</span>
                      <span className={styles.chartCardValue}>
                        {new Date(chart.createdAt).toLocaleString('ru-RU')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className={styles.primaryButtonSmall} onClick={() => setModalOpen(true)}>
              Рассчитать карту
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Пользователи</h1>
        <button type="button" className={styles.primaryButton} onClick={() => setModalOpen(true)}>
          Рассчитать карту
        </button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      <section className={styles.adminChartsSection}>
        <h2 className={styles.sectionTitle}>Карты, созданные в админке</h2>
        {loadingAdminCharts ? (
          <div className={styles.loading}>Загрузка...</div>
        ) : adminCharts.length === 0 ? (
          <div className={styles.empty}>Пока нет карт. Нажмите «Рассчитать карту».</div>
        ) : (
          <div className={styles.chartsList}>
            {adminCharts.map((chart) => (
              <div
                key={chart.id}
                className={styles.chartCard}
                onClick={() => handleAdminChartClick(chart.id)}
              >
                <div className={styles.chartCardHeader}>
                  <span className={styles.badgeAdmin}>Из админки</span>
                  <h3 className={styles.chartCardTitle}>{chart.name}</h3>
                </div>
                <div className={styles.chartCardInfo}>
                  <div className={styles.chartCardRow}>
                    <span className={styles.chartCardLabel}>Дата:</span>
                    <span className={styles.chartCardValue}>{chart.chartDate}</span>
                  </div>
                  <div className={styles.chartCardRow}>
                    <span className={styles.chartCardLabel}>Время:</span>
                    <span className={styles.chartCardValue}>{chart.chartTime}</span>
                  </div>
                  <div className={styles.chartCardRow}>
                    <span className={styles.chartCardLabel}>Город:</span>
                    <span className={styles.chartCardValue}>{chart.chartCity}</span>
                  </div>
                  <div className={styles.chartCardRow}>
                    <span className={styles.chartCardLabel}>Создана:</span>
                    <span className={styles.chartCardValue}>
                      {new Date(chart.createdAt).toLocaleString('ru-RU')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <h2 className={styles.sectionTitle}>Пользователи сервиса</h2>
      {users.length === 0 ? (
        <div className={styles.empty}>Пользователей не найдено</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.usersTable}>
            <thead>
              <tr>
                <th>Имя</th>
                <th>Контакт</th>
                <th>Тариф</th>
                <th>Карты пользователя</th>
                <th>Дата регистрации</th>
                <th>Последнее посещение</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email || user.phone || '—'}</td>
                  <td>
                    <select
                      value={user.planCode || 'free'}
                      className={styles.modalInput}
                      disabled={updatingPlanUserId === user.id}
                      onChange={(e) => handlePlanChange(user.id, e.target.value as 'free' | 'optimal' | 'professional')}
                    >
                      <option value="free">Бесплатный</option>
                      <option value="optimal">Оптимальный</option>
                      <option value="professional">Профессиональный</option>
                    </select>
                    {user.planExpiresAt && (
                      <div className={styles.chartCardValue}>
                        до {new Date(user.planExpiresAt).toLocaleDateString('ru-RU')}
                      </div>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => handleUserClick(user.id)}
                    >
                      {user.chartCount}
                    </button>
                  </td>
                  <td>{new Date(user.createdAt).toLocaleString('ru-RU')}</td>
                  <td>{user.lastVisitAt ? new Date(user.lastVisitAt).toLocaleString('ru-RU') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className={styles.modalOverlay} onClick={() => !createSubmitting && setModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Рассчитать карту</h2>
            <p className={styles.modalHint}>Карта сохраняется отдельно и не привязана к пользователям сервиса.</p>
            <form onSubmit={handleCreateChartSubmit} className={styles.modalForm}>
              <div className={styles.modalRow}>
                <label className={styles.modalLabel}>Имя</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  className={styles.modalInput}
                  placeholder="Имя для карты"
                  required
                />
              </div>
              <div className={styles.modalRow}>
                <label className={styles.modalLabel}>Пол</label>
                <select
                  value={createForm.gender}
                  onChange={(e) => setCreateForm((f) => ({ ...f, gender: e.target.value }))}
                  className={styles.modalInput}
                >
                  <option value="female">Женский</option>
                  <option value="male">Мужской</option>
                </select>
              </div>
              <div className={styles.modalRow}>
                <label className={styles.modalLabel}>Дата рождения</label>
                <input
                  type="date"
                  value={createForm.birthDate}
                  onChange={(e) => setCreateForm((f) => ({ ...f, birthDate: e.target.value }))}
                  className={styles.modalInput}
                  required
                />
              </div>
              <div className={styles.modalRow}>
                <label className={styles.modalLabel}>Время рождения</label>
                <input
                  type="time"
                  value={createForm.birthTime}
                  onChange={(e) => setCreateForm((f) => ({ ...f, birthTime: e.target.value }))}
                  className={styles.modalInput}
                  required
                />
              </div>
              <div className={styles.modalRow}>
                <label className={styles.modalLabel}>Место рождения</label>
                <input
                  type="text"
                  value={createForm.birthPlace}
                  onChange={(e) => setCreateForm((f) => ({ ...f, birthPlace: e.target.value }))}
                  className={styles.modalInput}
                  placeholder="Город, страна"
                  required
                />
              </div>
              {createError && <div className={styles.createError}>{createError}</div>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalCancel} onClick={() => setModalOpen(false)} disabled={createSubmitting}>
                  Отмена
                </button>
                <button type="submit" className={styles.modalSubmit} disabled={createSubmitting}>
                  {createSubmitting ? 'Расчёт...' : 'Рассчитать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
