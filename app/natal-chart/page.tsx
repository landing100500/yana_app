'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import NatalChartVisualization from '@/components/NatalChartVisualization';

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
}

export default function NatalChartPage() {
  const router = useRouter();
  const [charts, setCharts] = useState<ChartData[]>([]);
  const [selectedChart, setSelectedChart] = useState<ChartData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationProgress, setCalculationProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCharts();
  }, []);

  const loadCharts = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/natal-chart/calculate');
      const data = await response.json();

      if (response.ok && data.charts) {
        setCharts(data.charts);
        // Выбираем последнюю созданную карту
        if (data.charts.length > 0) {
          setSelectedChart(data.charts[0]);
        }
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err: any) {
      setError('Ошибка при загрузке натальных карт');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCalculate = async () => {
    try {
      setIsCalculating(true);
      setError(null);
      setCalculationProgress('Получение данных из анкеты...');
      
      const response = await fetch('/api/natal-chart/calculate', {
        method: 'POST',
      });
      
      setCalculationProgress('Расчет натальной карты...');
      
      // Проверяем статус перед чтением тела
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Ошибка при расчете' }));
        throw new Error(errorData.error || 'Ошибка при расчете');
      }
      
      const data = await response.json();

      if (data.chart) {
        setCalculationProgress('Сохранение результатов...');
        // Обновляем список карт и выбираем новую
        await loadCharts();
        setCalculationProgress('');
      } else {
        setError(data.error || 'Ошибка при расчете натальной карты');
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка при расчете натальной карты');
      console.error(err);
    } finally {
      setIsCalculating(false);
      setCalculationProgress('');
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
            <button 
              className={styles.newChartButton}
              onClick={handleCalculate}
              disabled={isCalculating}
            >
              {isCalculating ? 'Расчет...' : '+ Новая карта'}
            </button>
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
              <button 
                className={styles.calculateButton}
                onClick={handleCalculate}
                disabled={isCalculating}
              >
                {isCalculating ? 'Расчет...' : 'Создать первую карту'}
              </button>
            </div>
          )}

          {charts.length > 0 && (
            <div className={styles.chartsListItems}>
              {charts.map((chart) => (
                <div
                  key={chart.id}
                  className={`${styles.chartListItem} ${selectedChart?.id === chart.id ? styles.selected : ''}`}
                  onClick={() => setSelectedChart(chart)}
                >
                  <div className={styles.chartListItemName}>{chart.name}</div>
                  <div className={styles.chartListItemDate}>
                    {chart.chartDate} {chart.chartTime}
                  </div>
                  <div className={styles.chartListItemCity}>{chart.chartCity}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Отображение выбранной карты */}
        {selectedChart && (
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

            <NatalChartVisualization chart={selectedChart} />
          </div>
        )}
      </div>
    </div>
  );
}
