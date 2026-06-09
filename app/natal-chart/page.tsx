'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import NatalChartVisualization from '@/components/NatalChartVisualization';
import CircularProgressLoader from '@/components/ui/CircularProgressLoader';
import DatePicker from '@/components/ui/DatePicker';
import { loadNatalChartPage, readNatalChartPageCache } from '@/lib/natal-chart-page-load';
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
  timezone?: number;
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

function getInitialNatalCache() {
  if (typeof window === 'undefined') return null;
  return readNatalChartPageCache();
}

export default function NatalChartPage() {
  const router = useRouter();
  const initialCache = getInitialNatalCache();
  const [charts, setCharts] = useState<ChartData[]>(
    () => (initialCache?.charts as unknown as ChartData[]) ?? []
  );
  const [selectedChart, setSelectedChart] = useState<ChartData | null>(
    () => (initialCache?.selectedChart as unknown as ChartData | null) ?? null
  );
  const [isLoading, setIsLoading] = useState(() => !initialCache);
  const [loadProgress, setLoadProgress] = useState(() => (initialCache ? 100 : 5));
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationProgress, setCalculationProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [deletingChartId, setDeletingChartId] = useState<number | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(initialCache?.plan ?? null);
  const [activeChartId, setActiveChartId] = useState<number | null>(initialCache?.activeChartId ?? null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    birthDate: '',
    birthTime: '',
    birthPlace: '',
  });
  const [editForm, setEditForm] = useState({
    chartTime: '',
    chartCity: '',
  });

  useEffect(() => {
    const hadCache = !!readNatalChartPageCache();
    loadCharts({ silent: hadCache });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyNatalResult = (result: Awaited<ReturnType<typeof loadNatalChartPage>>) => {
    setCharts(result.charts as unknown as ChartData[]);
    setSelectedChart((result.selectedChart as unknown as ChartData | null) ?? null);
    setActiveChartId(result.activeChartId);
    setPlan(result.plan);
    if (result.error) setError(result.error);
  };

  const loadCharts = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      if (!silent) {
        setIsLoading(true);
        setLoadProgress(8);
      }
      const result = await loadNatalChartPage(
        silent ? undefined : (p) => setLoadProgress(p)
      );
      applyNatalResult(result);
    } catch (err: unknown) {
      if (!silent) {
        setError('Ошибка при загрузке натальных карт');
      }
      console.error(err);
    } finally {
      setLoadProgress(100);
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
      await loadCharts({ silent: true });
      setCreateForm({ name: '', birthDate: '', birthTime: '', birthPlace: '' });
      setIsCreateModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Ошибка при создании карты');
    } finally {
      setIsCalculating(false);
      setCalculationProgress('');
    }
  };

  const openEditModal = () => {
    if (!selectedChart) return;
    setEditForm({
      chartTime: selectedChart.chartTime.slice(0, 5),
      chartCity: selectedChart.chartCity,
    });
    setIsEditModalOpen(true);
  };

  const handleEditChart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChart) return;
    try {
      setIsCalculating(true);
      setError(null);
      setCalculationProgress('Пересчёт натальной карты...');
      const response = await fetch(`/api/natal-chart/${selectedChart.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chartTime: editForm.chartTime,
          chartCity: editForm.chartCity.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Ошибка при обновлении карты');
      await loadCharts({ silent: true });
      setIsEditModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Ошибка при обновлении карты');
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
    return <CircularProgressLoader progress={loadProgress} label="Загрузка карт" />;
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
              <button
                type="button"
                className={styles.editChartButton}
                onClick={openEditModal}
                disabled={isCalculating}
              >
                Изменить время и город
              </button>
            </div>

            <NatalChartVisualization chart={selectedChart} chartId={selectedChart.id} />
          </div>
        )}
      </div>
      {isEditModalOpen && selectedChart && (
        <div className={styles.modalOverlay} onClick={() => !isCalculating && setIsEditModalOpen(false)}>
          <div className={`${styles.modal} darkUi`} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Изменить время и город</h2>
            <p className={styles.modalHint}>Дата рождения остаётся прежней. Карта будет пересчитана по новым данным.</p>
            <form onSubmit={handleEditChart} className={styles.modalForm}>
              <div className={styles.modalRow}>
                <label className={styles.modalLabel}>Время рождения</label>
                <input
                  className={styles.modalInput}
                  type="time"
                  required
                  value={editForm.chartTime}
                  onChange={(e) => setEditForm((f) => ({ ...f, chartTime: e.target.value }))}
                />
              </div>
              <div className={styles.modalRow}>
                <label className={styles.modalLabel}>Город рождения</label>
                <input
                  className={styles.modalInput}
                  type="text"
                  required
                  value={editForm.chartCity}
                  onChange={(e) => setEditForm((f) => ({ ...f, chartCity: e.target.value }))}
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalCancel} onClick={() => setIsEditModalOpen(false)} disabled={isCalculating}>
                  Отмена
                </button>
                <button type="submit" className={styles.modalSubmit} disabled={isCalculating}>
                  {isCalculating ? 'Пересчёт...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {isCreateModalOpen && (
        <div className={styles.modalOverlay} onClick={() => !isCalculating && setIsCreateModalOpen(false)}>
          <div className={`${styles.modal} darkUi`} onClick={(e) => e.stopPropagation()}>
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
                <DatePicker
                  className={styles.modalInput}
                  required
                  value={createForm.birthDate}
                  onChange={(birthDate) => setCreateForm((f) => ({ ...f, birthDate }))}
                  max={new Date().toISOString().split('T')[0]}
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
