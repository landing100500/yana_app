'use client';

import { useState, useEffect } from 'react';
import styles from './AdminUsersCharts.module.css';
import NatalChartVisualization from '@/components/NatalChartVisualization';

interface User {
  id: number;
  phone: string;
  name: string;
  createdAt: string;
  chartCount: number;
}

interface Chart {
  id: number;
  name: string;
  chartDate: string;
  chartTime: string;
  chartCity: string;
  createdAt: string;
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
            <NatalChartVisualization chart={selectedChart} />
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
            Карты пользователя: {selectedUser.name} ({selectedUser.phone})
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
      <h1 className={styles.title}>Карты пользователей</h1>
      {error && <div className={styles.error}>{error}</div>}
      {users.length === 0 ? (
        <div className={styles.empty}>Пользователей не найдено</div>
      ) : (
        <div className={styles.usersList}>
          {users.map((user) => (
            <div
              key={user.id}
              className={styles.userCard}
              onClick={() => handleUserClick(user.id)}
            >
              <div className={styles.userCardHeader}>
                <h3 className={styles.userCardName}>{user.name}</h3>
                <div className={styles.userCardPhone}>{user.phone}</div>
              </div>
              <div className={styles.userCardStats}>
                <div className={styles.userCardStat}>
                  <span className={styles.userCardStatLabel}>Карт:</span>
                  <span className={styles.userCardStatValue}>{user.chartCount}</span>
                </div>
                <div className={styles.userCardStat}>
                  <span className={styles.userCardStatLabel}>Регистрация:</span>
                  <span className={styles.userCardStatValue}>
                    {new Date(user.createdAt).toLocaleDateString('ru-RU')}
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
