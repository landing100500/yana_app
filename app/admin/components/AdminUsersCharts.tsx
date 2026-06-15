'use client';

import { useState, useEffect, useMemo } from 'react';
import styles from './AdminUsersCharts.module.css';
import NatalChartVisualization from '@/components/NatalChartVisualization';

type PlanCode = 'free' | 'hours24' | 'optimalLight' | 'optimal' | 'professional';

interface User {
  id: number;
  email?: string | null;
  phone?: string | null;
  name: string;
  tariff: string;
  planCode?: PlanCode;
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

const PLAN_OPTIONS: { value: PlanCode; label: string }[] = [
  { value: 'free', label: 'Бесплатный' },
  { value: 'hours24', label: '24 часа' },
  { value: 'optimalLight', label: 'Оптимальный Лайт' },
  { value: 'optimal', label: 'Оптимальный' },
  { value: 'professional', label: 'Профессиональный' },
];

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
  const [emailFilter, setEmailFilter] = useState('');
  const [planFilter, setPlanFilter] = useState<'all' | PlanCode>('all');
  const [updatingPlanUserId, setUpdatingPlanUserId] = useState<number | null>(null);
  const [deleteModalUser, setDeleteModalUser] = useState<User | null>(null);
  const [deleteAdminPassword, setDeleteAdminPassword] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const planStats = useMemo(() => {
    const counts: Record<PlanCode, number> = {
      free: 0,
      hours24: 0,
      optimalLight: 0,
      optimal: 0,
      professional: 0,
    };
    for (const user of users) {
      const code = user.planCode || 'free';
      if (code in counts) counts[code]++;
      else counts.free++;
    }
    return counts;
  }, [users]);

  const filteredUsers = useMemo(() => {
    let result = users;
    const email = emailFilter.trim().toLowerCase();
    if (email) {
      result = result.filter((u) => (u.email || '').toLowerCase().includes(email));
    }
    if (planFilter !== 'all') {
      result = result.filter((u) => (u.planCode || 'free') === planFilter);
    }
    return result;
  }, [users, emailFilter, planFilter]);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      loadUserCharts(selectedUserId);
    } else {
      setCharts([]);
      setSelectedChart(null);
    }
  }, [selectedUserId]);

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
    loadChart(chartId);
  };

  const handleBack = () => {
    if (selectedChart) {
      setSelectedChart(null);
    } else if (selectedUserId) {
      setSelectedUserId(null);
      setSelectedUser(null);
      setCharts([]);
    }
  };

  const handlePlanChange = async (userId: number, planCode: PlanCode) => {
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

  const openDeleteUserModal = (user: User) => {
    setDeleteModalUser(user);
    setDeleteAdminPassword('');
    setDeleteError(null);
  };

  const closeDeleteUserModal = () => {
    if (deleteSubmitting) return;
    setDeleteModalUser(null);
    setDeleteAdminPassword('');
    setDeleteError(null);
  };

  const handleDeleteUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteModalUser) return;
    if (!deleteAdminPassword.trim()) {
      setDeleteError('Введите пароль админки');
      return;
    }
    if (!confirm('Вы уверены? Будет удалена ВСЯ информация по пользователю из всех баз данных.')) {
      return;
    }

    try {
      setDeleteSubmitting(true);
      setDeleteError(null);
      const response = await fetch(`/api/admin/users/${deleteModalUser.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: deleteAdminPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDeleteError(data.error || 'Не удалось удалить пользователя');
        return;
      }

      setUsers((prev) => prev.filter((u) => u.id !== deleteModalUser.id));
      if (selectedUserId === deleteModalUser.id) {
        setSelectedUserId(null);
        setSelectedUser(null);
        setCharts([]);
        setSelectedChart(null);
      }
      closeDeleteUserModal();
    } catch (err) {
      setDeleteError('Ошибка сети при удалении пользователя');
    } finally {
      setDeleteSubmitting(false);
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
            ← Назад
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
        )}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Пользователи</h1>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.statsSection}>
        <h2 className={styles.sectionTitle}>Статистика по тарифам</h2>
        <div className={styles.statsGrid}>
          {PLAN_OPTIONS.map((plan) => (
            <div key={plan.value} className={styles.statCard}>
              <span className={styles.statLabel}>{plan.label}</span>
              <span className={styles.statValue}>{planStats[plan.value]}</span>
            </div>
          ))}
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Всего</span>
            <span className={styles.statValue}>{users.length}</span>
          </div>
        </div>
      </section>

      <section className={styles.filtersSection}>
        <h2 className={styles.sectionTitle}>Поиск и фильтр</h2>
        <div className={styles.filters}>
          <label className={styles.filterLabel}>
            E-mail
            <input
              type="text"
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              className={styles.filterInput}
              placeholder="user@example.com"
            />
          </label>
          <label className={styles.filterLabel}>
            Тариф
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value as 'all' | PlanCode)}
              className={styles.filterInput}
            >
              <option value="all">Все тарифы</option>
              {PLAN_OPTIONS.map((plan) => (
                <option key={plan.value} value={plan.value}>
                  {plan.label}
                </option>
              ))}
            </select>
          </label>
          {(emailFilter || planFilter !== 'all') && (
            <button
              type="button"
              className={styles.clearFiltersButton}
              onClick={() => {
                setEmailFilter('');
                setPlanFilter('all');
              }}
            >
              Сбросить
            </button>
          )}
        </div>
      </section>

      <h2 className={styles.sectionTitle}>
        Пользователи сервиса
        {(emailFilter || planFilter !== 'all') && (
          <span className={styles.filteredCount}> — {filteredUsers.length} из {users.length}</span>
        )}
      </h2>
      {filteredUsers.length === 0 ? (
        <div className={styles.empty}>
          {users.length === 0 ? 'Пользователей не найдено' : 'Нет пользователей по заданным фильтрам'}
        </div>
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
                <th>Удалить</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email || user.phone || '—'}</td>
                  <td>
                    <select
                      value={user.planCode || 'free'}
                      className={styles.modalInput}
                      disabled={updatingPlanUserId === user.id}
                      onChange={(e) => handlePlanChange(user.id, e.target.value as PlanCode)}
                    >
                      {PLAN_OPTIONS.map((plan) => (
                        <option key={plan.value} value={plan.value}>
                          {plan.label}
                        </option>
                      ))}
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
                  <td>
                    <button
                      type="button"
                      className={styles.deleteUserIconButton}
                      title="Удалить пользователя"
                      onClick={() => openDeleteUserModal(user)}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteModalUser && (
        <div className={styles.modalOverlay} onClick={closeDeleteUserModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Удаление пользователя</h2>
            <p className={styles.modalHint}>
              Пользователь: {deleteModalUser.name} ({deleteModalUser.email || deleteModalUser.phone || `#${deleteModalUser.id}`})
            </p>
            <form onSubmit={handleDeleteUserSubmit} className={styles.modalForm}>
              <div className={styles.modalRow}>
                <label className={styles.modalLabel}>Пароль админки</label>
                <input
                  type="password"
                  value={deleteAdminPassword}
                  onChange={(e) => setDeleteAdminPassword(e.target.value)}
                  className={styles.modalInput}
                  placeholder="Введите пароль"
                  required
                />
              </div>
              {deleteError && <div className={styles.createError}>{deleteError}</div>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalCancel} onClick={closeDeleteUserModal} disabled={deleteSubmitting}>
                  Отмена
                </button>
                <button type="submit" className={styles.modalSubmit} disabled={deleteSubmitting}>
                  {deleteSubmitting ? 'Удаление...' : 'Удалить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
