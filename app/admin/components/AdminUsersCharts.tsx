'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import AdminPagination from './AdminPagination';
import DatePicker from '@/components/ui/DatePicker';
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
  freeAiRequestsUsed?: number;
  freeAiRequestsLimit?: number;
  remainingAiRequests?: number;
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

const PLAN_PRICES: Record<Exclude<PlanCode, 'free'>, number> = {
  hours24: 900,
  optimalLight: 2990,
  optimal: 9900,
  professional: 49000,
};

const PLAN_DEFAULT_MONTHS: Record<Exclude<PlanCode, 'free'>, string> = {
  hours24: '1',
  optimalLight: '1',
  optimal: '1',
  professional: '6',
};

export default function AdminUsersCharts() {
  const [users, setUsers] = useState<User[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [planStats, setPlanStats] = useState<Record<PlanCode, number>>({
    free: 0,
    hours24: 0,
    optimalLight: 0,
    optimal: 0,
    professional: 0,
  });
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [charts, setCharts] = useState<Chart[]>([]);
  const [selectedChart, setSelectedChart] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [loadingCharts, setLoadingCharts] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFilter, setEmailFilter] = useState('');
  const [debouncedEmailFilter, setDebouncedEmailFilter] = useState('');
  const [planFilter, setPlanFilter] = useState<'all' | PlanCode>('all');
  const [remainingFilter, setRemainingFilter] = useState<'all' | string>('all');
  const [registeredFrom, setRegisteredFrom] = useState('');
  const [registeredTo, setRegisteredTo] = useState('');
  const [bulkAddAmount, setBulkAddAmount] = useState('6');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [grantBusyUserId, setGrantBusyUserId] = useState<number | null>(null);
  const [rowGrantAmount, setRowGrantAmount] = useState<Record<number, string>>({});
  const [listModalOpen, setListModalOpen] = useState(false);
  const [listName, setListName] = useState('');
  const [updatingPlanUserId, setUpdatingPlanUserId] = useState<number | null>(null);
  const [planModal, setPlanModal] = useState<{
    userId: number;
    planCode: PlanCode;
    currentPlanCode: PlanCode;
  } | null>(null);
  const [planMonths, setPlanMonths] = useState('1');
  const [planStartMode, setPlanStartMode] = useState<'from_now' | 'extend'>('from_now');
  const [planStatsAmount, setPlanStatsAmount] = useState('');
  const [deleteModalUser, setDeleteModalUser] = useState<User | null>(null);
  const [deleteAdminPassword, setDeleteAdminPassword] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const totalFromStats = useMemo(
    () => Object.values(planStats).reduce((sum, n) => sum + n, 0),
    [planStats]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedEmailFilter(emailFilter.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [emailFilter]);

  const loadUsers = useCallback(async (targetPage = page) => {
    const isFirstLoad = !hasLoadedOnceRef.current;
    try {
      if (isFirstLoad) setLoading(true);
      else setTableLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '50',
      });
      if (debouncedEmailFilter) params.set('email', debouncedEmailFilter);
      if (planFilter !== 'all') params.set('planCode', planFilter);
      if (remainingFilter !== 'all') params.set('freeAiRemaining', remainingFilter);
      if (registeredFrom) params.set('registeredFrom', registeredFrom);
      if (registeredTo) params.set('registeredTo', registeredTo);

      const response = await fetch(`/api/admin/users?${params}`);
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setUsers(data.users || []);
        setPage(data.page || targetPage);
        setTotalPages(data.totalPages || 1);
        setTotalUsers(data.total || 0);
        if (data.planStats) setPlanStats(data.planStats);
        hasLoadedOnceRef.current = true;
      } else {
        setError(data.error || 'Ошибка при загрузке пользователей');
      }
    } catch (err: unknown) {
      setError('Ошибка при загрузке пользователей');
      console.error(err);
    } finally {
      setLoading(false);
      setTableLoading(false);
    }
  }, [debouncedEmailFilter, planFilter, remainingFilter, registeredFrom, registeredTo, page]);

  useEffect(() => {
    loadUsers(page);
  }, [page, debouncedEmailFilter, planFilter, remainingFilter, registeredFrom, registeredTo, loadUsers]);

  const currentFiltersPayload = useCallback(() => {
    const payload: Record<string, unknown> = {};
    if (debouncedEmailFilter) payload.email = debouncedEmailFilter;
    if (planFilter !== 'all') payload.planCode = planFilter;
    if (remainingFilter !== 'all') payload.freeAiRemaining = Number(remainingFilter);
    if (registeredFrom) payload.registeredFrom = registeredFrom;
    if (registeredTo) payload.registeredTo = registeredTo;
    return payload;
  }, [debouncedEmailFilter, planFilter, remainingFilter, registeredFrom, registeredTo]);

  const hasActiveFilters =
    Boolean(debouncedEmailFilter) ||
    planFilter !== 'all' ||
    remainingFilter !== 'all' ||
    Boolean(registeredFrom) ||
    Boolean(registeredTo);

  const grantToUser = async (userId: number) => {
    const raw = rowGrantAmount[userId] ?? '6';
    const add = Number.parseInt(raw, 10);
    if (!Number.isFinite(add) || add <= 0) {
      setError('Укажите число запросов > 0');
      return;
    }
    setGrantBusyUserId(userId);
    setError(null);
    setBulkNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/free-ai-requests`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Не удалось добавить запросы');
        return;
      }
      setBulkNotice(`User #${userId}: остаток теперь ${data.remainingAiRequests}`);
      await loadUsers(page);
    } catch {
      setError('Ошибка сети');
    } finally {
      setGrantBusyUserId(null);
    }
  };

  const grantToFiltered = async () => {
    const add = Number.parseInt(bulkAddAmount, 10);
    if (!Number.isFinite(add) || add <= 0) {
      setError('Укажите число запросов > 0');
      return;
    }
    if (totalUsers <= 0) {
      setError('Нет пользователей по фильтру');
      return;
    }
    const ok = window.confirm(
      `Добавить по ${add} запросов каждому из ${totalUsers} пользователям по текущему фильтру?`
    );
    if (!ok) return;

    setBulkBusy(true);
    setError(null);
    setBulkNotice(null);
    try {
      const res = await fetch('/api/admin/users/free-ai-requests/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grant', add, ...currentFiltersPayload() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Не удалось выдать запросы');
        return;
      }
      setBulkNotice(`Выдано +${add} запросов: обновлено ${data.updated} из ${data.matched}`);
      await loadUsers(page);
    } catch {
      setError('Ошибка сети');
    } finally {
      setBulkBusy(false);
    }
  };

  const createListFromFiltered = async () => {
    const name = listName.trim();
    if (!name) {
      setError('Укажите название списка');
      return;
    }
    if (totalUsers <= 0) {
      setError('Нет пользователей по фильтру');
      return;
    }
    setBulkBusy(true);
    setError(null);
    setBulkNotice(null);
    try {
      const res = await fetch('/api/admin/users/free-ai-requests/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createMailList',
          listName: name,
          ...currentFiltersPayload(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Не удалось создать список');
        return;
      }
      setBulkNotice(
        `Список «${name}» создан (id ${data.listId}): добавлено ${data.added} из ${data.matched}`
      );
      setListModalOpen(false);
      setListName('');
    } catch {
      setError('Ошибка сети');
    } finally {
      setBulkBusy(false);
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

  useEffect(() => {
    if (selectedUserId) {
      loadUserCharts(selectedUserId);
    } else {
      setCharts([]);
      setSelectedChart(null);
    }
  }, [selectedUserId]);

  const goToPage = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    setPage(nextPage);
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

  const handlePlanSelect = (userId: number, planCode: PlanCode, currentPlanCode: PlanCode) => {
    if (planCode === 'free') {
      void applyPlanChange(userId, { planCode: 'free' });
      return;
    }
    setPlanModal({ userId, planCode, currentPlanCode });
    setPlanMonths(PLAN_DEFAULT_MONTHS[planCode]);
    setPlanStartMode('from_now');
    setPlanStatsAmount(String(PLAN_PRICES[planCode]));
  };

  const applyPlanChange = async (
    userId: number,
    payload: {
      planCode: PlanCode;
      months?: number;
      startMode?: 'from_now' | 'extend';
      statsAmountRub?: number | null;
    }
  ) => {
    try {
      setUpdatingPlanUserId(userId);
      const response = await fetch(`/api/admin/users/${userId}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(data.error || 'Не удалось обновить тариф');
        return;
      }
      setPlanModal(null);
      await loadUsers(page);
    } catch (err) {
      alert('Ошибка сети при обновлении тарифа');
    } finally {
      setUpdatingPlanUserId(null);
    }
  };

  const submitPlanModal = () => {
    if (!planModal) return;
    const months = Number(planMonths);
    const statsRaw = planStatsAmount.trim().replace(',', '.');
    const statsAmount = Number(statsRaw);
    if (!Number.isFinite(statsAmount) || statsAmount < 0) {
      alert('Укажите корректную сумму для статистики (>= 0)');
      return;
    }
    const payload: {
      planCode: PlanCode;
      months?: number;
      startMode: 'from_now' | 'extend';
      statsAmountRub: number;
    } = {
      planCode: planModal.planCode,
      startMode: planStartMode,
      statsAmountRub: statsAmount,
    };
    if (Number.isFinite(months) && months > 0) {
      payload.months = months;
    }
    void applyPlanChange(planModal.userId, payload);
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

      {error && (
        <div className={styles.error}>
          {error}
          <button type="button" className={styles.clearFiltersButton} onClick={() => loadUsers(page)}>
            Повторить
          </button>
        </div>
      )}

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
            <span className={styles.statValue}>{totalFromStats}</span>
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
              onChange={(e) => {
                setPlanFilter(e.target.value as 'all' | PlanCode);
                setPage(1);
              }}
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
          <label className={styles.filterLabel}>
            Осталось AI-запросов
            <select
              value={remainingFilter}
              onChange={(e) => {
                setRemainingFilter(e.target.value);
                setPage(1);
              }}
              className={styles.filterInput}
            >
              <option value="all">Любое</option>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={String(n)}>
                  Ровно {n}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterLabel}>
            Регистрация от
            <DatePicker
              value={registeredFrom}
              onChange={(v) => {
                setRegisteredFrom(v);
                setPage(1);
              }}
              theme="dark"
              className={styles.filterInput}
              wrapperClassName={styles.dateFilterWrap}
            />
          </label>
          <label className={styles.filterLabel}>
            до
            <DatePicker
              value={registeredTo}
              onChange={(v) => {
                setRegisteredTo(v);
                setPage(1);
              }}
              theme="dark"
              className={styles.filterInput}
              wrapperClassName={styles.dateFilterWrap}
              min={registeredFrom || undefined}
            />
          </label>
          {hasActiveFilters && (
            <button
              type="button"
              className={styles.clearFiltersButton}
              onClick={() => {
                setEmailFilter('');
                setPlanFilter('all');
                setRemainingFilter('all');
                setRegisteredFrom('');
                setRegisteredTo('');
                setPage(1);
              }}
            >
              Сбросить
            </button>
          )}
        </div>

        <div className={styles.bulkActions}>
          <label className={styles.filterLabel}>
            Добавить запросов
            <input
              type="number"
              min={1}
              className={styles.filterInput}
              style={{ minWidth: '6rem' }}
              value={bulkAddAmount}
              onChange={(e) => setBulkAddAmount(e.target.value)}
              disabled={bulkBusy}
            />
          </label>
          <button
            type="button"
            className={styles.bulkPrimaryButton}
            disabled={bulkBusy || totalUsers === 0}
            onClick={() => void grantToFiltered()}
          >
            Выдать всем по фильтру ({totalUsers})
          </button>
          <button
            type="button"
            className={styles.bulkSecondaryButton}
            disabled={bulkBusy || totalUsers === 0}
            onClick={() => {
              setListName(
                remainingFilter === '0'
                  ? `AI остаток 0 · ${new Date().toLocaleDateString('ru-RU')}`
                  : `Фильтр AI · ${new Date().toLocaleDateString('ru-RU')}`
              );
              setListModalOpen(true);
            }}
          >
            Создать список рассылки
          </button>
        </div>
        {bulkNotice && <p className={styles.bulkNotice}>{bulkNotice}</p>}
      </section>

      <h2 className={styles.sectionTitle}>
        Пользователи сервиса
        <span className={styles.filteredCount}>
          {' '}
          — {totalUsers} {hasActiveFilters ? 'найдено' : 'всего'}
          {totalPages > 1 && ` · страница ${page} из ${totalPages}`}
        </span>
      </h2>
      {tableLoading && <div className={styles.loadingInline}>Обновление списка...</div>}
      {users.length === 0 && !tableLoading ? (
        <div className={styles.empty}>
          {totalUsers === 0 ? 'Пользователей не найдено' : 'Нет пользователей по заданным фильтрам'}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.usersTable}>
            <thead>
              <tr>
                <th>Имя</th>
                <th>Контакт</th>
                <th>Тариф</th>
                <th>AI остаток</th>
                <th>Карты пользователя</th>
                <th>Дата регистрации</th>
                <th>Последнее посещение</th>
                <th>Удалить</th>
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
                      onChange={(e) =>
                        handlePlanSelect(
                          user.id,
                          e.target.value as PlanCode,
                          (user.planCode || 'free') as PlanCode
                        )
                      }
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
                    <div className={styles.aiRemainingCell}>
                      <strong>{user.remainingAiRequests ?? 0}</strong>
                      <span className={styles.chartCardValue}>
                        {user.freeAiRequestsUsed ?? 0}/{user.freeAiRequestsLimit ?? 0}
                      </span>
                      <div className={styles.aiGrantRow}>
                        <input
                          type="number"
                          min={1}
                          className={styles.aiGrantInput}
                          value={rowGrantAmount[user.id] ?? '6'}
                          onChange={(e) =>
                            setRowGrantAmount((prev) => ({ ...prev, [user.id]: e.target.value }))
                          }
                          disabled={grantBusyUserId === user.id}
                        />
                        <button
                          type="button"
                          className={styles.linkButton}
                          disabled={grantBusyUserId === user.id}
                          onClick={() => void grantToUser(user.id)}
                        >
                          +
                        </button>
                      </div>
                    </div>
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

      {totalPages > 1 && (
        <AdminPagination
          page={page}
          totalPages={totalPages}
          total={totalUsers}
          loading={tableLoading}
          onPageChange={goToPage}
        />
      )}

      {planModal && (
        <div className={styles.modalOverlay} onClick={() => setPlanModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Выдача тарифа</h2>
            <p className={styles.modalHint}>
              {PLAN_OPTIONS.find((p) => p.value === planModal.planCode)?.label || planModal.planCode}
              {' · '}
              user #{planModal.userId}
            </p>

            <div className={styles.modalForm}>
              <div className={styles.modalRow}>
                <label className={styles.modalLabel} htmlFor="plan-months">
                  Срок, месяцев
                </label>
                <input
                  id="plan-months"
                  className={styles.modalInput}
                  type="number"
                  min={1}
                  max={120}
                  value={planMonths}
                  onChange={(e) => setPlanMonths(e.target.value)}
                />
                <span className={styles.modalFieldHint}>1 месяц = 30 дней</span>
              </div>

              <div className={styles.modalRow}>
                <label className={styles.modalLabel} htmlFor="plan-start">
                  Дата старта
                </label>
                <select
                  id="plan-start"
                  className={styles.modalInput}
                  value={planStartMode}
                  onChange={(e) => setPlanStartMode(e.target.value as 'from_now' | 'extend')}
                >
                  <option value="from_now">С нуля (от сейчас)</option>
                  <option value="extend">Продлить от текущего срока</option>
                </select>
              </div>

              <div className={styles.modalRow}>
                <label className={styles.modalLabel} htmlFor="plan-stats">
                  Сумма в статистике дохода, ₽
                </label>
                <input
                  id="plan-stats"
                  className={styles.modalInput}
                  type="number"
                  min={0}
                  step={1}
                  value={planStatsAmount}
                  onChange={(e) => setPlanStatsAmount(e.target.value)}
                />
                <span className={styles.modalFieldHint}>
                  По умолчанию цена тарифа. Поставьте 0, чтобы не учитывать в доходе.
                </span>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.modalCancel}
                  onClick={() => setPlanModal(null)}
                  disabled={updatingPlanUserId === planModal.userId}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className={styles.modalSubmit}
                  onClick={submitPlanModal}
                  disabled={updatingPlanUserId === planModal.userId}
                >
                  Выдать
                </button>
              </div>
            </div>
          </div>
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

      {listModalOpen && (
        <div className={styles.modalOverlay} onClick={() => !bulkBusy && setListModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Список рассылки из фильтра</h2>
            <p className={styles.modalHint}>
              Будут добавлены все {totalUsers} пользователей по текущему фильтру (не только текущая
              страница).
            </p>
            <div className={styles.modalForm}>
              <div className={styles.modalRow}>
                <label className={styles.modalLabel} htmlFor="mail-list-name">
                  Название списка
                </label>
                <input
                  id="mail-list-name"
                  className={styles.modalInput}
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  disabled={bulkBusy}
                />
              </div>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.modalCancel}
                  onClick={() => setListModalOpen(false)}
                  disabled={bulkBusy}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className={styles.modalSubmit}
                  onClick={() => void createListFromFiltered()}
                  disabled={bulkBusy || !listName.trim()}
                >
                  {bulkBusy ? 'Создание…' : 'Создать'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
