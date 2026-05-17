import { CACHE_KEYS, getCached, setCached } from '@/lib/client-page-cache';

const ACTIVE_CHART_STORAGE_KEY = 'active_natal_chart_id';

export type NatalChartListItem = {
  id: number;
  name: string;
  chartDate: string;
  chartTime: string;
  chartCity: string;
  isMain?: boolean;
  isFrozen?: boolean;
  [key: string]: unknown;
};

export type PlanInfo = {
  code: 'free' | 'optimal' | 'professional';
  title: string;
  maxCharts: number | null;
  chartComparison: boolean;
};

export type NatalChartPageLoadResult = {
  charts: NatalChartListItem[];
  selectedChart: NatalChartListItem | null;
  activeChartId: number | null;
  plan: PlanInfo | null;
  error: string | null;
};

function pickDefaultChart(charts: NatalChartListItem[]): NatalChartListItem | null {
  const available = charts.filter((c) => !c.isFrozen);
  if (available.length === 0) return charts[0] ?? null;

  const storedRaw = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_CHART_STORAGE_KEY) : null;
  const storedId = storedRaw ? Number(storedRaw) : null;
  if (storedId) {
    const stored = available.find((c) => c.id === storedId);
    if (stored) return stored;
  }
  return available.find((c) => c.isMain) ?? available[0] ?? null;
}

function mergeWithCache(fresh: NatalChartPageLoadResult): NatalChartPageLoadResult {
  const cached = getCached<NatalChartPageLoadResult>(CACHE_KEYS.natalChartPage);
  if (!cached) return fresh;

  const charts = fresh.charts.length > 0 ? fresh.charts : cached.charts;
  const selectedChart = fresh.selectedChart ?? (charts.length > 0 ? pickDefaultChart(charts) : cached.selectedChart);

  return {
    charts,
    selectedChart,
    activeChartId: fresh.activeChartId ?? selectedChart?.id ?? cached.activeChartId,
    plan: fresh.plan ?? cached.plan,
    error: fresh.error ?? cached.error,
  };
}

export function readNatalChartPageCache(): NatalChartPageLoadResult | null {
  return getCached<NatalChartPageLoadResult>(CACHE_KEYS.natalChartPage);
}

export async function loadNatalChartPage(
  onProgress?: (percent: number) => void
): Promise<NatalChartPageLoadResult> {
  const total = 2;
  let done = 0;
  const tick = () => {
    done += 1;
    onProgress?.(Math.min(100, Math.round((done / total) * 100)));
  };

  let charts: NatalChartListItem[] = [];
  let plan: PlanInfo | null = null;
  let error: string | null = null;

  try {
    const [chartsRes, profileRes] = await Promise.all([
      fetch('/api/natal-chart/calculate').finally(tick),
      fetch('/api/auth/profile', { credentials: 'include' }).finally(tick),
    ]);

    const [data, profileData] = await Promise.all([
      chartsRes.json().catch(() => ({})),
      profileRes.json().catch(() => ({})),
    ]);

    if (chartsRes.ok && data.charts) {
      charts = data.charts;
    } else if (data.error) {
      error = data.error;
    }

    if (profileRes.ok && profileData?.plan) {
      plan = profileData.plan;
    }
  } catch {
    error = 'Ошибка при загрузке натальных карт';
  }

  const selectedChart = pickDefaultChart(charts);
  const fresh: NatalChartPageLoadResult = {
    charts,
    selectedChart,
    activeChartId: selectedChart?.id ?? null,
    plan,
    error,
  };

  const merged = mergeWithCache(fresh);
  if (merged.charts.length > 0 || merged.plan) {
    setCached(CACHE_KEYS.natalChartPage, merged);
  }

  return merged;
}
