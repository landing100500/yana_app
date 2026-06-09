/** Маркетинговые цены в текстах (оплата может отличаться на этапе теста). */
export const PLAN_MARKETING_PRICES = {
  hours24: 900,
  optimal: 9900,
  professional: 49000,
} as const;

export const TARIFFS_PATH = '/tariffs';

export function getTariffsLinkMarkdown(label = 'перейти к тарифам'): string {
  return `[${label}](${TARIFFS_PATH})`;
}

export function buildSessionEndedUpsellMessage(): string {
  return [
    'Бесплатные запросы к ИИ закончились. Мы можем продолжить и решить твои вопросы за 24 часа, оплата 900 рублей.',
    '',
    'Доступ на 30 дней, + 5 карт, + совместимость между ними. Стань экспертом для близких прямо сейчас и мы вместе решим их вопросы. Оплата 9900 рублей.',
    '',
    'Профессиональный доступ на 180 дней, неограниченное количество карт, + совместимость между ними. Уверенные консультации и дополнительный доход. Оплата 49000 рублей.',
    '',
    'Какой тариф выбираем?',
    getTariffsLinkMarkdown('Выбрать тариф'),
  ].join('\n');
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
