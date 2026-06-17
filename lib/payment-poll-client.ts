import { CACHE_KEYS, clearPageCache } from '@/lib/client-page-cache';

const PENDING_PAYMENT_KEY = 'yana:pending-payment:v1';
export const PLAN_UPDATED_EVENT = 'yana:plan-updated';

export type PaymentPlanSnapshot = {
  code: string;
  title: string;
  expiresAt?: string | null;
  hasUnlimitedTime?: boolean;
  hasDailyTimeLimit?: boolean;
  remainingSeconds?: number | null;
  remainingAiRequests?: number | null;
  chartComparison?: boolean;
};

export type PaymentPollResult = {
  status: 'succeeded' | 'canceled' | 'pending' | 'error';
  plan?: PaymentPlanSnapshot;
  message?: string;
};

let activePollPaymentId: string | null = null;
let activePollPromise: Promise<PaymentPollResult> | null = null;

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

export function setPendingPaymentId(id: number | string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_PAYMENT_KEY, String(id));
  } catch {
    // ignore
  }
}

export function getPendingPaymentId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(PENDING_PAYMENT_KEY);
  } catch {
    return null;
  }
}

export function clearPendingPaymentId(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PENDING_PAYMENT_KEY);
  } catch {
    // ignore
  }
}

export function clearPlanCaches(): void {
  clearPageCache(CACHE_KEYS.chatBootstrap);
  clearPageCache(CACHE_KEYS.natalChartPage);
}

export function notifyPlanUpdated(plan?: PaymentPlanSnapshot): void {
  clearPlanCaches();
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PLAN_UPDATED_EVENT, { detail: { plan } }));
}

export function onPlanUpdated(handler: (plan?: PaymentPlanSnapshot) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ plan?: PaymentPlanSnapshot }>).detail;
    handler(detail?.plan);
  };
  window.addEventListener(PLAN_UPDATED_EVENT, listener);
  return () => window.removeEventListener(PLAN_UPDATED_EVENT, listener);
}

export function pollPaymentUntilSettled(
  paymentId: number | string,
  options?: {
    onProgress?: (attempt: number) => void;
    maxAttempts?: number;
    intervalMs?: number;
  }
): Promise<PaymentPollResult> {
  const id = String(paymentId);
  setPendingPaymentId(id);

  if (activePollPaymentId === id && activePollPromise) {
    return activePollPromise;
  }

  const maxAttempts = options?.maxAttempts ?? 40;
  const intervalMs = options?.intervalMs ?? 3000;

  activePollPaymentId = id;
  const pollPromise = new Promise<PaymentPollResult>((resolve) => {
    let attempts = 0;
    let timerId: number | null = null;

    const finish = (result: PaymentPollResult) => {
      if (timerId !== null) window.clearTimeout(timerId);
      resolve(result);
    };

    const poll = async () => {
      attempts += 1;
      options?.onProgress?.(attempts);

      try {
        const res = await fetchWithAuthRestore(
          `/api/payments/status?id=${encodeURIComponent(id)}`
        );
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (attempts < maxAttempts && (res.status >= 500 || res.status === 401)) {
            timerId = window.setTimeout(poll, intervalMs);
            return;
          }
          clearPendingPaymentId();
          finish({
            status: 'error',
            message: data?.error || 'Не удалось проверить статус оплаты',
          });
          return;
        }

        if (data.status === 'succeeded') {
          clearPendingPaymentId();
          notifyPlanUpdated(data.plan);
          finish({ status: 'succeeded', plan: data.plan });
          return;
        }

        if (data.status === 'canceled') {
          clearPendingPaymentId();
          finish({ status: 'canceled', message: 'Оплата отменена' });
          return;
        }

        if (attempts >= maxAttempts) {
          finish({
            status: 'pending',
            message: 'Платёж ещё обрабатывается. Обновите страницу через минуту.',
          });
          return;
        }

        timerId = window.setTimeout(poll, intervalMs);
      } catch {
        if (attempts >= maxAttempts) {
          finish({ status: 'error', message: 'Ошибка сети при проверке оплаты' });
          return;
        }
        timerId = window.setTimeout(poll, intervalMs);
      }
    };

    poll();
  });

  activePollPromise = pollPromise.finally(() => {
    if (activePollPaymentId === id) {
      activePollPaymentId = null;
      activePollPromise = null;
    }
  });

  return pollPromise;
}

export function resumePendingPaymentPoll(
  callbacks?: {
    onSucceeded?: (plan?: PaymentPlanSnapshot) => void;
    onCanceled?: () => void;
    onPending?: (message?: string) => void;
    onError?: (message: string) => void;
  }
): void {
  const pendingId = getPendingPaymentId();
  if (!pendingId) return;

  pollPaymentUntilSettled(pendingId).then((result) => {
    if (result.status === 'succeeded') {
      callbacks?.onSucceeded?.(result.plan);
    } else if (result.status === 'canceled') {
      callbacks?.onCanceled?.();
    } else if (result.status === 'pending') {
      callbacks?.onPending?.(result.message);
    } else if (result.status === 'error') {
      callbacks?.onError?.(result.message || 'Ошибка проверки оплаты');
    }
  });
}
