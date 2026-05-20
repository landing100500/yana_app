const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';
const YOOKASSA_TIMEOUT_MS = 30000;

export interface YookassaAmount {
  value: string;
  currency: string;
}

export interface YookassaPayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  paid: boolean;
  amount: YookassaAmount;
  confirmation?: {
    type: string;
    confirmation_url?: string;
    return_url?: string;
  };
  metadata?: Record<string, string>;
  description?: string;
  test?: boolean;
}

interface CreatePaymentInput {
  amount: YookassaAmount;
  capture: boolean;
  confirmation: {
    type: 'redirect';
    return_url: string;
  };
  description: string;
  metadata: Record<string, string>;
  receipt?: Record<string, unknown>;
}

function getCredentials(): { shopId: string; secretKey: string } {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    throw new Error('YOOKASSA_SHOP_ID or YOOKASSA_SECRET_KEY is not configured');
  }
  return { shopId, secretKey };
}

function getAuthHeader(): string {
  const { shopId, secretKey } = getCredentials();
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`;
}

async function parseYookassaResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data?.description === 'string'
        ? data.description
        : `YooKassa API error (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function createYookassaPayment(
  input: CreatePaymentInput,
  idempotenceKey: string
): Promise<YookassaPayment> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), YOOKASSA_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${YOOKASSA_API_URL}/payments`, {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
        'Idempotence-Key': idempotenceKey,
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('ЮKassa не ответила вовремя, попробуйте снова');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  return parseYookassaResponse<YookassaPayment>(response);
}

export async function getYookassaPayment(paymentId: string): Promise<YookassaPayment> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), YOOKASSA_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${YOOKASSA_API_URL}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Не удалось проверить статус платежа в ЮKassa');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  return parseYookassaResponse<YookassaPayment>(response);
}

export function formatRubAmount(valueRub: number): string {
  return valueRub.toFixed(2);
}
