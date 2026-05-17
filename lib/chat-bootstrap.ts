import { SELF_KNOWLEDGE_QUESTION_TITLES } from '@/lib/self-knowledge-questions';
import { CACHE_KEYS, getCached, setCached } from '@/lib/client-page-cache';

const ACTIVE_CHART_STORAGE_KEY = 'active_natal_chart_id';

export type BootstrapProfile = {
  email: string | null;
  name?: string;
  plan?: {
    code: 'free' | 'optimal' | 'professional';
    title: string;
    expiresAt: string | null;
    hasUnlimitedTime: boolean;
    remainingSeconds: number | null;
    chartComparison: boolean;
  };
};

export type BootstrapChatContext = {
  name: string | null;
  hasMainNatalChart: boolean;
  selfKnowledgeQuestions: string[];
};

export type BootstrapTopic = {
  id: number;
  title: string;
  createdAt: string;
};

export type BootstrapChart = {
  id: number;
  name: string;
  chartDate: string;
  chartTime: string;
  chartCity: string;
  isMain?: boolean;
  isFrozen?: boolean;
};

export type ChatBootstrapResult = {
  profile: BootstrapProfile | null;
  chatContext: BootstrapChatContext;
  topics: BootstrapTopic[];
  charts: BootstrapChart[];
  selectedChartId: number | null;
};

async function fetchWithAuthRestore(url: string, init?: RequestInit): Promise<Response> {
  let response = await fetch(url, { credentials: 'include', ...init });
  if (response.status !== 401) return response;

  const backupToken = typeof window !== 'undefined' ? localStorage.getItem('auth_token_backup') : null;
  if (!backupToken) return response;

  const restoreResponse = await fetch('/api/auth/set-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: backupToken }),
    credentials: 'include',
  });
  if (!restoreResponse.ok) return response;

  return fetch(url, { credentials: 'include', ...init });
}

async function fetchProfile(): Promise<BootstrapProfile | null> {
  const response = await fetchWithAuthRestore('/api/auth/profile');
  if (!response.ok) return null;
  return response.json();
}

async function fetchChatContext(): Promise<BootstrapChatContext | null> {
  const res = await fetch('/api/chat/context', { credentials: 'include' });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    name: data.name ?? null,
    hasMainNatalChart: !!data.hasMainNatalChart,
    selfKnowledgeQuestions: Array.isArray(data.selfKnowledgeQuestions)
      ? data.selfKnowledgeQuestions
      : SELF_KNOWLEDGE_QUESTION_TITLES,
  };
}

async function fetchTopics(): Promise<BootstrapTopic[] | null> {
  const response = await fetch('/api/chat/topics', { credentials: 'include' });
  if (!response.ok) return null;
  const data = await response.json();
  return data.topics || [];
}

function resolveSelectedChartId(
  availableCharts: BootstrapChart[],
  currentId: number | null
): number | null {
  if (availableCharts.length === 0) return null;
  if (currentId && availableCharts.some((c) => c.id === currentId)) return currentId;

  const storedRaw = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_CHART_STORAGE_KEY) : null;
  const storedId = storedRaw ? Number(storedRaw) : null;
  if (storedId && availableCharts.some((c) => c.id === storedId)) return storedId;

  const mainChart = availableCharts.find((c) => c.isMain);
  return mainChart?.id ?? availableCharts[0].id;
}

async function fetchCharts(currentId: number | null): Promise<{
  charts: BootstrapChart[];
  selectedChartId: number | null;
} | null> {
  const res = await fetch('/api/natal-chart/calculate', { credentials: 'include' });
  if (!res.ok) return null;
  const data = await res.json();
  const allCharts: BootstrapChart[] = Array.isArray(data.charts) ? data.charts : [];
  const availableCharts = allCharts.filter((c) => !c.isFrozen);
  const selectedChartId = resolveSelectedChartId(availableCharts, currentId);
  return { charts: availableCharts, selectedChartId };
}

const defaultContext = (): BootstrapChatContext => ({
  name: null,
  hasMainNatalChart: false,
  selfKnowledgeQuestions: SELF_KNOWLEDGE_QUESTION_TITLES,
});

function mergeWithCache(fresh: ChatBootstrapResult): ChatBootstrapResult {
  const cached = getCached<ChatBootstrapResult>(CACHE_KEYS.chatBootstrap);
  if (!cached) return fresh;

  const contextFromNetwork =
    fresh.chatContext.name !== null || fresh.chatContext.hasMainNatalChart;

  return {
    profile: fresh.profile ?? cached.profile,
    chatContext: contextFromNetwork ? fresh.chatContext : cached.chatContext,
    topics: fresh.topics.length > 0 ? fresh.topics : cached.topics,
    charts: fresh.charts.length > 0 ? fresh.charts : cached.charts,
    selectedChartId: fresh.selectedChartId ?? cached.selectedChartId,
  };
}

function hasUsableData(data: ChatBootstrapResult): boolean {
  return (
    data.profile !== null
    || data.chatContext.hasMainNatalChart
    || data.topics.length > 0
    || data.charts.length > 0
  );
}

export function readChatBootstrapCache(): ChatBootstrapResult | null {
  return getCached<ChatBootstrapResult>(CACHE_KEYS.chatBootstrap);
}

export async function loadChatPageBootstrap(
  currentChartId: number | null,
  onProgress?: (percent: number) => void
): Promise<ChatBootstrapResult> {
  const total = 4;
  let done = 0;
  const tick = () => {
    done += 1;
    onProgress?.(Math.min(100, Math.round((done / total) * 100)));
  };

  const [profile, chatContext, topics, chartsResult] = await Promise.all([
    fetchProfile()
      .then((v) => {
        tick();
        return v;
      })
      .catch(() => {
        tick();
        return null;
      }),
    fetchChatContext()
      .then((v) => {
        tick();
        return v;
      })
      .catch(() => {
        tick();
        return null;
      }),
    fetchTopics()
      .then((v) => {
        tick();
        return v;
      })
      .catch(() => {
        tick();
        return null;
      }),
    fetchCharts(currentChartId)
      .then((v) => {
        tick();
        return v;
      })
      .catch(() => {
        tick();
        return null;
      }),
  ]);

  const fresh: ChatBootstrapResult = {
    profile,
    chatContext: chatContext ?? defaultContext(),
    topics: topics ?? [],
    charts: chartsResult?.charts ?? [],
    selectedChartId: chartsResult?.selectedChartId ?? null,
  };

  const merged = mergeWithCache(fresh);

  if (hasUsableData(merged)) {
    setCached(CACHE_KEYS.chatBootstrap, merged);
  }

  return merged;
}
