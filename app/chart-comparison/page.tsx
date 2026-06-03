'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

interface ChartItem {
  id: number;
  name: string;
  chartDate: string;
  chartTime: string;
  chartCity: string;
  isFrozen?: boolean;
}

interface PlanInfo {
  chartComparison: boolean;
}

export default function ChartComparisonPage() {
  const router = useRouter();
  const [charts, setCharts] = useState<ChartItem[]>([]);
  const [first, setFirst] = useState<number | null>(null);
  const [second, setSecond] = useState<number | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [profileRes, chartsRes] = await Promise.all([
          fetch('/api/auth/profile', { credentials: 'include' }),
          fetch('/api/natal-chart/calculate', { credentials: 'include' }),
        ]);
        const profileData = await profileRes.json().catch(() => ({}));
        const chartsData = await chartsRes.json().catch(() => ({}));
        if (!profileRes.ok || !profileData?.plan) {
          router.push('/chat');
          return;
        }
        setPlan(profileData.plan);
        if (!profileData.plan.chartComparison) {
          setError('Сравнение карт недоступно на вашем тарифе.');
          return;
        }
        const rows = Array.isArray(chartsData.charts) ? chartsData.charts : [];
        setCharts(rows.filter((c: ChartItem) => !c.isFrozen));
      } catch {
        setError('Не удалось загрузить данные');
      }
    })();
  }, [router]);

  const startComparison = () => {
    if (!first || !second || first === second) return;
    const chartA = charts.find((c) => c.id === first);
    const chartB = charts.find((c) => c.id === second);
    if (!chartA || !chartB) return;
    localStorage.setItem(
      'chart_comparison_mode',
      JSON.stringify({
        chartAId: chartA.id,
        chartAName: chartA.name,
        chartBId: chartB.id,
        chartBName: chartB.name,
      })
    );
    router.push('/chat');
  };

  return (
    <div className={`${styles.container} darkUi`}>
      <div className={styles.inner}>
        <button className={styles.backButton} onClick={() => router.push('/chat')}>← Назад</button>
        <h1>Сравнение карт</h1>
        <div className={styles.panel}>
          {error && <p>{error}</p>}
          {!error && (
            <>
              <p>Выберите две карты для режима сравнения в чате.</p>
              <div className={styles.grid}>
                <div>
                  <label className={styles.label}>Карта 1</label>
                  <select className={styles.input} value={first ?? ''} onChange={(e) => setFirst(Number(e.target.value) || null)}>
                    <option value="">Выберите карту</option>
                    {charts.map((chart) => (
                      <option key={chart.id} value={chart.id}>
                        {chart.name} ({chart.chartDate} {chart.chartTime}, {chart.chartCity})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={styles.label}>Карта 2</label>
                  <select className={styles.input} value={second ?? ''} onChange={(e) => setSecond(Number(e.target.value) || null)}>
                    <option value="">Выберите карту</option>
                    {charts.map((chart) => (
                      <option key={chart.id} value={chart.id}>
                        {chart.name} ({chart.chartDate} {chart.chartTime}, {chart.chartCity})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.actions}>
                <button className={styles.secondaryButton} onClick={() => router.push('/natal-chart')}>К картам</button>
                <button className={styles.button} onClick={startComparison} disabled={!plan?.chartComparison || !first || !second || first === second}>
                  Перейти в чат в режиме сравнения
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
