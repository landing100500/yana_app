const TTL_MS = 10 * 60 * 1000; // 10 мин

type CacheEnvelope<T> = {
  savedAt: number;
  data: T;
};

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed?.data || Date.now() - parsed.savedAt > TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function write<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    const envelope: CacheEnvelope<T> = { savedAt: Date.now(), data };
    sessionStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // quota / private mode
  }
}

export function clearPageCache(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const CACHE_KEYS = {
  chatBootstrap: 'yana:chat-bootstrap:v1',
  natalChartPage: 'yana:natal-chart-page:v1',
  sessionAuth: 'yana:session-auth:v1',
} as const;

export function getCached<T>(key: string): T | null {
  return read<T>(key);
}

export function setCached<T>(key: string, data: T): void {
  write(key, data);
}

export function hasCached(key: string): boolean {
  return getCached(key) !== null;
}

export function markSessionAuthenticated(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(CACHE_KEYS.sessionAuth, '1');
  } catch {
    // ignore
  }
}

export function isSessionAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(CACHE_KEYS.sessionAuth) === '1';
  } catch {
    return false;
  }
}

export function clearSessionCaches(): void {
  clearPageCache(CACHE_KEYS.chatBootstrap);
  clearPageCache(CACHE_KEYS.natalChartPage);
  clearPageCache(CACHE_KEYS.sessionAuth);
}
