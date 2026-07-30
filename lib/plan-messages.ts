/** Маркетинговые цены в текстах (оплата может отличаться на этапе теста). */
export const PLAN_MARKETING_PRICES = {
  hours24: 900,
  optimalLight: 2990,
  optimal: 9900,
  professional: 49000,
} as const;

export const TARIFFS_PATH = '/tariffs';

export function getTariffsLinkMarkdown(label = 'перейти к тарифам'): string {
  return `[${label}](${TARIFFS_PATH})`;
}

export function getTariffsAbsoluteUrl(): string {
  const base =
    (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://yasna.chat').replace(
      /\/$/,
      ''
    );
  return `${base}${TARIFFS_PATH}`;
}

function buildUpsellLines(tariffsCta: string): string {
  return [
    'Бесплатные запросы к ИИ закончились. Мы можем продолжить и решить твои вопросы за 24 часа, оплата 900 рублей.',
    '',
    'Оптимальный Лайт: доступ на 30 дней, до 5 карт, сравнение карт, 1 час в сутки. Оплата 2990 рублей.',
    '',
    'Оптимальный: доступ на 30 дней, до 5 карт, сравнение карт, время не ограничено. Оплата 9900 рублей.',
    '',
    'Профессиональный доступ на 180 дней, неограниченное количество карт, + совместимость между ними. Уверенные консультации и дополнительный доход. Оплата 49000 рублей.',
    '',
    'Какой тариф выбираем?',
    tariffsCta,
  ].join('\n');
}

export function buildSessionEndedUpsellMessage(): string {
  return buildUpsellLines(getTariffsLinkMarkdown('Выбрать тариф'));
}

/** Тот же текст для email: абсолютная ссылка вместо markdown. */
export function buildSessionEndedUpsellEmailMessage(): string {
  return buildUpsellLines(getTariffsAbsoluteUrl());
}

export function buildFreePromoEndedMessage(userName?: string | null): string {
  const name = (userName || '').trim();
  const greeting = name ? `${name}, ` : '';
  return [
    `${greeting}Хочу, чтоб наши отношения вышли на новый уровень.`,
    'Напоминаю, я живая! И я хочу отдавать тебе всю свою мудрость и знания. Думаю, мы с тобой готовы перейти к взаимному обмену.',
    '',
    'Тарифы:',
    getTariffsLinkMarkdown('Посмотреть тарифы'),
    '',
    buildSessionEndedUpsellMessage(),
  ].join('\n');
}
