'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import NatalChartVisualization from '@/components/NatalChartVisualization';
const ACTIVE_CHART_STORAGE_KEY = 'active_natal_chart_id';

interface NavamshaData {
  sun?: { longitude: number; sign: number; signName: string; degree: number };
  moon?: { longitude: number; sign: number; signName: string; degree: number };
  mercury?: { longitude: number; sign: number; signName: string; degree: number };
  venus?: { longitude: number; sign: number; signName: string; degree: number };
  mars?: { longitude: number; sign: number; signName: string; degree: number };
  jupiter?: { longitude: number; sign: number; signName: string; degree: number };
  saturn?: { longitude: number; sign: number; signName: string; degree: number };
  ascendant?: { longitude: number; sign: number; signName: string; degree: number };
}

interface DashaData {
  planet?: string;
  startDate?: string;
  endDate?: string;
  duration?: string;
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
  navamsha?: NavamshaData;
  dashas?: DashaData[];
  isMain?: boolean;
  isFrozen?: boolean;
}

interface PlanInfo {
  code: 'free' | 'optimal' | 'professional';
  title: string;
  maxCharts: number | null;
  chartComparison: boolean;
}

export default function NatalChartPage() {
  const router = useRouter();
  const [charts, setCharts] = useState<ChartData[]>([]);
  const [selectedChart, setSelectedChart] = useState<ChartData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationProgress, setCalculationProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [deletingChartId, setDeletingChartId] = useState<number | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [activeChartId, setActiveChartId] = useState<number | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    birthDate: '',
    birthTime: '',
    birthPlace: '',
  });

  useEffect(() => {
    loadCharts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCharts = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/natal-chart/calculate');
      const data = await response.json();

      if (response.ok && data.charts) {
        setCharts(data.charts);
        const availableCharts = data.charts.filter((c: ChartData) => !c.isFrozen);
        const storedRaw = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_CHART_STORAGE_KEY) : null;
        const storedId = storedRaw ? Number(storedRaw) : null;
        const defaultChart =
          (storedId && availableCharts.find((c: ChartData) => c.id === storedId))
          || availableCharts.find((c: ChartData) => c.isMain)
          || availableCharts[0]
          || data.charts[0]
          || null;
        setSelectedChart(defaultChart);
        setActiveChartId(defaultChart?.id ?? null);
      } else if (data.error) {
        setError(data.error);
      }
      const profileRes = await fetch('/api/auth/profile', { credentials: 'include' });
      const profileData = await profileRes.json().catch(() => ({}));
      if (profileRes.ok && profileData?.plan) {
        setPlan(profileData.plan);
      }
    } catch (err: any) {
      setError('Ошибка при загрузке натальных карт');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateOtherPersonChart = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsCalculating(true);
      setError(null);
      setCalculationProgress('Расчет натальной карты...');
      const response = await fetch('/api/natal-chart/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          birthDate: createForm.birthDate,
          birthTime: createForm.birthTime,
          birthPlace: createForm.birthPlace.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Ошибка при создании карты');
      await loadCharts();
      setCreateForm({ name: '', birthDate: '', birthTime: '', birthPlace: '' });
      setIsCreateModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Ошибка при создании карты');
    } finally {
      setIsCalculating(false);
      setCalculationProgress('');
    }
  };

  const handleDelete = async (chartId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Предотвращаем выбор карты при клике на удаление
    
    if (!confirm('Вы уверены, что хотите удалить эту карту?')) {
      return;
    }

    try {
      setDeletingChartId(chartId);
      const response = await fetch(`/api/natal-chart/${chartId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Ошибка при удалении' }));
        throw new Error(errorData.error || 'Ошибка при удалении карты');
      }

      // Удаляем карту из списка
      setCharts(prev => {
        const remainingCharts = prev.filter(chart => chart.id !== chartId);
        if (activeChartId === chartId) {
          const nextActive = remainingCharts.find((c) => !c.isFrozen) || null;
          setActiveChartId(nextActive?.id ?? null);
          if (nextActive?.id) {
            localStorage.setItem(ACTIVE_CHART_STORAGE_KEY, String(nextActive.id));
          } else {
            localStorage.removeItem(ACTIVE_CHART_STORAGE_KEY);
          }
        }
        
        // Если удаленная карта была выбрана, выбираем другую или очищаем выбор
        if (selectedChart?.id === chartId) {
          setSelectedChart(remainingCharts.length > 0 ? remainingCharts[0] : null);
        }
        
        return remainingCharts;
      });
    } catch (err: any) {
      setError(err.message || 'Ошибка при удалении карты');
      console.error(err);
    } finally {
      setDeletingChartId(null);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Загрузка...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button 
          className={styles.backButton}
          onClick={() => router.push('/chat')}
        >
          ← Назад
        </button>
        <h1 className={styles.title}>Натальная карта</h1>
      </div>

      {error && (
        <div className={styles.error}>
          {error}
          {error.includes('не заполнена') && (
            <button 
              className={styles.fillAnketaButton}
              onClick={() => router.push('/anketa')}
            >
              Заполнить анкету
            </button>
          )}
        </div>
      )}

      <div className={styles.chartsContainer}>
        {/* Список карт */}
        <div className={styles.chartsList}>
          <div className={styles.listHeader}>
            <h2>Мои карты</h2>
          </div>
          {plan && (
            <div className={styles.chartListItemDate}>
              Тариф: {plan.title}
            </div>
          )}
          <div className={styles.actionsRow}>
            <button
              className={styles.newChartButton}
              onClick={() => setIsCreateModalOpen(true)}
              disabled={isCalculating || plan?.code === 'free'}
            >
              + Карта другого человека
            </button>
            {plan?.chartComparison && (
              <button className={styles.newChartButton} onClick={() => router.push('/chart-comparison')}>
                Сравнение карт
              </button>
            )}
          </div>
          
          {isCalculating && (
            <div className={styles.progressContainer}>
              <div className={styles.progressBar}>
                <div className={styles.progressFill}></div>
              </div>
              {calculationProgress && (
                <p className={styles.progressText}>{calculationProgress}</p>
              )}
            </div>
          )}

          {charts.length === 0 && !isLoading && (
            <div className={styles.emptyState}>
              <p>Карты еще не созданы</p>
            </div>
          )}

          {charts.length > 0 && (
            <div className={styles.chartsListItems}>
              {charts.map((chart) => (
                <div
                  key={chart.id}
                  className={`${styles.chartListItem} ${selectedChart?.id === chart.id ? styles.selected : ''} ${chart.isFrozen ? styles.frozen : ''}`}
                  onClick={() => {
                    if (!chart.isFrozen) {
                      setSelectedChart(chart);
                      setActiveChartId(chart.id);
                      localStorage.setItem(ACTIVE_CHART_STORAGE_KEY, String(chart.id));
                    }
                  }}
                >
                  <div className={styles.chartListItemContent}>
                    <div className={styles.chartListItemName}>{chart.name}</div>
                    {chart.isMain && <div className={styles.chartListItemDate}>Основная карта (по анкете)</div>}
                    {activeChartId === chart.id && <div className={styles.chatActiveBadge}>Активна для ответов в чате</div>}
                    <div className={styles.chartListItemDate}>
                      {chart.chartDate} {chart.chartTime}
                    </div>
                    <div className={styles.chartListItemCity}>{chart.chartCity}</div>
                    {chart.isFrozen && <div className={styles.chartFrozenHint}>Карта заморожена текущим тарифом</div>}
                  </div>
                  {!chart.isMain && (
                    <button
                      className={styles.deleteButton}
                      onClick={(e) => handleDelete(chart.id, e)}
                      disabled={deletingChartId === chart.id}
                      title="Удалить карту"
                    >
                      {deletingChartId === chart.id ? '...' : '×'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Отображение выбранной карты */}
        {selectedChart && !selectedChart.isFrozen && (
          <div className={styles.chartContainer}>
            <div className={styles.chartInfo}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Название:</span>
                <span className={styles.infoValue}>{selectedChart.name}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Дата:</span>
                <span className={styles.infoValue}>{selectedChart.chartDate}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Время:</span>
                <span className={styles.infoValue}>{selectedChart.chartTime}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Место:</span>
                <span className={styles.infoValue}>{selectedChart.chartCity}</span>
              </div>
            </div>

            <NatalChartVisualization chart={selectedChart} chartId={selectedChart.id} />
          </div>
        )}
      </div>
      {isCreateModalOpen && (
        <div className={styles.modalOverlay} onClick={() => !isCalculating && setIsCreateModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Карта другого человека</h2>
            <form onSubmit={handleCreateOtherPersonChart} className={styles.modalForm}>
              <div className={styles.modalRow}>
                <label className={styles.modalLabel}>Имя</label>
                <input
                  className={styles.modalInput}
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className={styles.modalRow}>
                <label className={styles.modalLabel}>Дата рождения</label>
                <input
                  className={styles.modalInput}
                  type="date"
                  required
                  value={createForm.birthDate}
                  onChange={(e) => setCreateForm((f) => ({ ...f, birthDate: e.target.value }))}
                />
              </div>
              <div className={styles.modalRow}>
                <label className={styles.modalLabel}>Время рождения</label>
                <input
                  className={styles.modalInput}
                  type="time"
                  required
                  value={createForm.birthTime}
                  onChange={(e) => setCreateForm((f) => ({ ...f, birthTime: e.target.value }))}
                />
              </div>
              <div className={styles.modalRow}>
                <label className={styles.modalLabel}>Город рождения</label>
                <input
                  className={styles.modalInput}
                  type="text"
                  required
                  value={createForm.birthPlace}
                  onChange={(e) => setCreateForm((f) => ({ ...f, birthPlace: e.target.value }))}
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalCancel} onClick={() => setIsCreateModalOpen(false)} disabled={isCalculating}>
                  Отмена
                </button>
                <button type="submit" className={styles.modalSubmit} disabled={isCalculating}>
                  {isCalculating ? 'Расчет...' : 'Рассчитать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
