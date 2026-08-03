/** Классификация SMTP-ошибок провайдера (Beget и аналоги). */

export function getSmtpErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || '');
}

export function getSmtpResponseCode(error: unknown): number | null {
  const code = (error as { responseCode?: number })?.responseCode;
  return typeof code === 'number' ? code : null;
}

/** Beget: ящик жив, но исходящая отправка отключена (часто после массовых рассылок). */
export function isMailboxSendingDisabled(error: unknown): boolean {
  const msg = getSmtpErrorMessage(error).toLowerCase();
  const code = getSmtpResponseCode(error);
  return (
    msg.includes('message sending is disabled') ||
    msg.includes('sending is disabled for mailbox') ||
    (code === 550 && msg.includes('beget') && msg.includes('disabled'))
  );
}

/** Unisender Go / ESP: дневной лимит тарифа — очередь надо поставить на паузу, pending не жечь. */
export function isProviderQuotaExhaustedError(error: unknown): boolean {
  const msg = getSmtpErrorMessage(error).toLowerCase();
  return (
    msg.includes('reached your daily limit') ||
    msg.includes('daily limit of') ||
    msg.includes('try again tomorrow') ||
    msg.includes('emails_included') ||
    (msg.includes('daily') && msg.includes('limit') && msg.includes('contact our support'))
  );
}

/** Фатальные ошибки провайдера — продолжать долбить очередь бессмысленно. */
export function isFatalSmtpProviderError(error: unknown): boolean {
  if (isMailboxSendingDisabled(error)) return true;
  if (isProviderQuotaExhaustedError(error)) return true;
  const msg = getSmtpErrorMessage(error).toLowerCase();
  const code = getSmtpResponseCode(error);
  return (
    msg.includes('daily sending limit') ||
    msg.includes('sending limit exceeded') ||
    msg.includes('relay access denied') ||
    (code === 550 && (msg.includes('limit') || msg.includes('blocked') || msg.includes('disabled'))) ||
    code === 554
  );
}

/** Unisender Go failed_emails statuses that mean «не слать больше». */
const UNISENDER_PERMANENT_FAILED_STATUSES = new Set([
  'invalid',
  'permanent_unavailable',
  'unsubscribed',
  'spam',
  'blocked',
]);

/** temporary_unavailable — 3 суток у Go; suppress не ставим. */
const UNISENDER_TEMPORARY_FAILED_STATUSES = new Set(['temporary_unavailable', 'duplicate']);

/** Статусы из body.failed_emails ответа Unisender Go. */
export function getUnisenderFailedEmailStatuses(error: unknown): string[] {
  const body = (error as { body?: unknown })?.body;
  if (!body || typeof body !== 'object') return [];
  const failed = (body as { failed_emails?: unknown }).failed_emails;
  if (!failed || typeof failed !== 'object' || Array.isArray(failed)) return [];
  return Object.values(failed as Record<string, unknown>).map((v) => String(v).toLowerCase());
}

/** Отказ ESP по конкретному адресу (не квота/не SMTP down) — без CRITICAL burst. */
export function isEspRecipientReject(error: unknown): boolean {
  const msg = getSmtpErrorMessage(error).toLowerCase();
  if (msg.includes('no valid recipients')) return true;
  if (getUnisenderFailedEmailStatuses(error).length > 0) return true;
  return isPermanentRecipientBounce(error);
}

/**
 * Постоянный отказ по получателю — больше не слать на этот адрес.
 * Включает iCloud 554 HM08 / local policy (Beget как раз за это банил).
 */
export function isPermanentRecipientBounce(error: unknown): boolean {
  const msg = getSmtpErrorMessage(error).toLowerCase();
  const code = getSmtpResponseCode(error);
  if (isMailboxSendingDisabled(error)) return false;

  const failedStatuses = getUnisenderFailedEmailStatuses(error);
  if (failedStatuses.length > 0) {
    // Только temporary/duplicate → не suppress. Любой permanent → suppress.
    // Смесь permanent+temporary при одном recipients[] (мы шлём 1 email) — тоже suppress.
    if (failedStatuses.every((s) => UNISENDER_TEMPORARY_FAILED_STATUSES.has(s))) {
      return false;
    }
    if (failedStatuses.some((s) => UNISENDER_PERMANENT_FAILED_STATUSES.has(s))) {
      return true;
    }
  }

  // Unisender Go: «No valid recipients» без failed_emails (или неизвестный статус) —
  // один to: значит адрес отклонён; suppress, иначе снова в очередь + CRITICAL.
  if (msg.includes('no valid recipients')) {
    return true;
  }

  // Unisender Go / ESP
  const apiCode = (error as { code?: number | string })?.code;
  if (
    apiCode === 204 ||
    apiCode === 205 ||
    msg.includes('invalid email') ||
    msg.includes('recipient is unavailable') ||
    msg.includes('unsubscribed') ||
    msg.includes('email is in suppression list')
  ) {
    // не всё из этого — permanent bounce; suppression/unsubscribed уже отфильтрованы у нас
    if (
      msg.includes('invalid email') ||
      msg.includes('recipient is unavailable') ||
      msg.includes('email is in suppression list')
    ) {
      return true;
    }
  }

  if (
    code === 554 ||
    msg.includes('554 5.7.1') ||
    msg.includes('[hm08]') ||
    msg.includes('local policy') ||
    msg.includes('message rejected due to local policy')
  ) {
    return true;
  }

  if (code === 550 || code === 551 || code === 553) {
    if (
      msg.includes('user unknown') ||
      msg.includes('does not exist') ||
      msg.includes('mailbox unavailable') ||
      msg.includes('no such user') ||
      msg.includes('recipient rejected') ||
      msg.includes('invalid recipient') ||
      msg.includes('address rejected') ||
      msg.includes('unknown user')
    ) {
      return true;
    }
  }

  return (
    msg.includes('user unknown') ||
    msg.includes('mailbox unavailable') ||
    msg.includes('no such user') ||
    (msg.includes('550') && msg.includes('recipient'))
  );
}

export function isConnectionError(error: unknown): boolean {
  const msg = getSmtpErrorMessage(error).toLowerCase();
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  return (
    code.includes('econn') ||
    code.includes('etimedout') ||
    code.includes('esocket') ||
    code.includes('econnreset') ||
    msg.includes('timeout') ||
    msg.includes('connection') ||
    msg.includes('socket') ||
    msg.includes('greet')
  );
}
