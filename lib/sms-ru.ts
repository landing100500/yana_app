const SMS_RU_SEND = 'https://sms.ru/sms/send';

export type SmsRuSendResult =
  | { ok: true; balance?: number }
  | { ok: false; error: string; statusCode?: number };

/**
 * Отправка SMS через sms.ru (POST, json=1).
 * API-ключ только из env SMS_RU_API_ID — не хардкодить в репозитории.
 */
export async function sendSmsRu(params: {
  to: string;
  message: string;
  clientIp?: string | null;
  test?: boolean;
}): Promise<SmsRuSendResult> {
  const apiId = process.env.SMS_RU_API_ID;
  if (!apiId) {
    return { ok: false, error: 'SMS_RU_API_ID не задан' };
  }

  const body = new URLSearchParams({
    api_id: apiId,
    to: params.to,
    msg: params.message,
    json: '1',
  });

  if (params.clientIp) {
    body.set('ip', params.clientIp);
  }
  if (params.test || process.env.SMS_RU_TEST === '1') {
    body.set('test', '1');
  }

  const res = await fetch(SMS_RU_SEND, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: body.toString(),
  });

  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, error: 'Некорректный ответ sms.ru' };
  }

  if (data.status !== 'OK') {
    const code = typeof data.status_code === 'number' ? data.status_code : undefined;
    const msg =
      typeof data.status_text === 'string'
        ? data.status_text
        : 'Ошибка отправки SMS';
    return { ok: false, error: msg, statusCode: code };
  }

  const sms = data.sms as Record<string, { status?: string; status_text?: string }> | undefined;
  if (sms && typeof sms === 'object') {
    const first = Object.values(sms)[0];
    if (first && first.status === 'ERROR') {
      return {
        ok: false,
        error: first.status_text || 'Ошибка доставки на номер',
      };
    }
  }

  const balance = typeof data.balance === 'number' ? data.balance : undefined;
  return { ok: true, balance };
}
