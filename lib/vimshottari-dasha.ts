/**
 * Вимшоттари даша: расчёт махадаш и антардаш по сидерической долготе Луны при рождении.
 * Используется в калькуляторе карты, личном кабинете и промптах для ИИ.
 */

export const DASHA_LORDS = [
  'Кету',
  'Венера',
  'Солнце',
  'Луна',
  'Марс',
  'Раху',
  'Юпитер',
  'Сатурн',
  'Меркурий',
] as const;

/** Длительность махадаши каждой планеты (лет) */
export const DASHA_YEARS: Record<(typeof DASHA_LORDS)[number], number> = {
  Кету: 7,
  Венера: 20,
  Солнце: 6,
  Луна: 10,
  Марс: 7,
  Раху: 18,
  Юпитер: 16,
  Сатурн: 19,
  Меркурий: 17,
};

export const NAKSHATRA_SPAN_DEG = 360 / 27;
/** Сидерический год для даш (365.25 суток) */
export const DASHA_DAYS_PER_YEAR = 365.25;

export const NAKSHATRA_NAMES = [
  'Ашвини',
  'Бхарани',
  'Криттика',
  'Рохини',
  'Мригашира',
  'Ардра',
  'Пурнавасу',
  'Пушья',
  'Ашлеша',
  'Магха',
  'Пурва Пхалгуни',
  'Уттара Пхалгуни',
  'Хаста',
  'Читра',
  'Свати',
  'Вишакха',
  'Анурадха',
  'Джьештха',
  'Мула',
  'Пурва Ашадха',
  'Уттара Ашадха',
  'Шравана',
  'Дхаништха',
  'Шатабхиша',
  'Пурва Бхадрапада',
  'Уттара Бхадрапада',
  'Ревати',
] as const;

/** Индекс управителя даши (0–8) для каждой из 27 накшатр */
const NAKSHATRA_DASHA_LORD_INDEX = Array.from({ length: 27 }, (_, i) => i % 9);

export interface DashaPeriod {
  planet: string;
  startDate: string;
  endDate: string;
  duration: string;
  /** ISO timestamp начала (для сравнения) */
  startMs: number;
  endMs: number;
}

export interface AntardashaPeriod {
  planet: string;
  startDate: string;
  endDate: string;
  startMs: number;
  endMs: number;
}

export interface VimshottariBirthMeta {
  moonNakshatra: string;
  moonNakshatraIndex: number;
  birthMahadashaLord: string;
  balanceYearsAtBirth: number;
}

export interface ActiveVimshottariDasha {
  mahadasha: DashaPeriod;
  antardasha: AntardashaPeriod;
  meta: VimshottariBirthMeta;
}

function normalizeLongitude(longitude: number): number {
  const n = longitude % 360;
  return n < 0 ? n + 360 : n;
}

const NAKSHATRA_RULER_ABBR: Record<(typeof DASHA_LORDS)[number], string> = {
  Кету: 'Ке',
  Венера: 'Ve',
  Солнце: 'Su',
  Луна: 'Mo',
  Марс: 'Ma',
  Раху: 'Ra',
  Юпитер: 'Ju',
  Сатурн: 'Sa',
  Меркурий: 'Me',
};

/** Накшатра по сидерической долготе (0° = начало Ашвини, шаг 13°20'). */
export function longitudeToNakshatra(longitude: number): {
  nakshatraIndex: number;
  nakshatra: number;
  pada: number;
  name: string;
  ruler: string;
} {
  const normalized = normalizeLongitude(longitude);
  const nakshatraIndex = Math.floor(normalized / NAKSHATRA_SPAN_DEG) % 27;
  const degreeInNakshatra = normalized % NAKSHATRA_SPAN_DEG;
  const padaSpan = NAKSHATRA_SPAN_DEG / 4;
  let pada = Math.floor(degreeInNakshatra / padaSpan) + 1;
  if (pada > 4) pada = 4;
  const lord = DASHA_LORDS[NAKSHATRA_DASHA_LORD_INDEX[nakshatraIndex]];
  return {
    nakshatraIndex,
    nakshatra: nakshatraIndex,
    pada,
    name: NAKSHATRA_NAMES[nakshatraIndex],
    ruler: NAKSHATRA_RULER_ABBR[lord],
  };
}

function dashaLordIndex(planet: string): number {
  const idx = DASHA_LORDS.indexOf(planet as (typeof DASHA_LORDS)[number]);
  return idx >= 0 ? idx : 0;
}

function addDashaYears(fromMs: number, years: number): number {
  return fromMs + years * DASHA_DAYS_PER_YEAR * 24 * 60 * 60 * 1000;
}

/** Локальное время рождения → UTC (timezone — смещение от UTC в часах, как в карте) */
export function parseBirthUtcMs(
  birthDate: string,
  birthTime: string,
  timezoneHours = 0
): number {
  const [y, m, d] = birthDate.split('-').map((v) => parseInt(v, 10));
  const timeParts = birthTime.split(':');
  const hour = parseInt(timeParts[0] || '0', 10);
  const minute = parseInt(timeParts[1] || '0', 10);
  const second = parseInt(timeParts[2] || '0', 10);
  return Date.UTC(y, m - 1, d, hour, minute, second) - timezoneHours * 3600000;
}

/** Дата YYYY-MM-DD в часовом поясе рождения */
export function formatDashaDateLocal(utcMs: number, timezoneHours = 0): string {
  const localMs = utcMs + timezoneHours * 3600000;
  const dt = new Date(localMs);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export function getMoonNakshatraMeta(moonLongitude: number): VimshottariBirthMeta {
  const moonNorm = normalizeLongitude(moonLongitude);
  const nakshatraIndex = Math.floor(moonNorm / NAKSHATRA_SPAN_DEG) % 27;
  const degreeInNakshatra = moonNorm % NAKSHATRA_SPAN_DEG;
  const lordIndex = NAKSHATRA_DASHA_LORD_INDEX[nakshatraIndex];
  const birthLord = DASHA_LORDS[lordIndex];
  const remainingFraction = (NAKSHATRA_SPAN_DEG - degreeInNakshatra) / NAKSHATRA_SPAN_DEG;
  const balanceYearsAtBirth = DASHA_YEARS[birthLord] * remainingFraction;

  return {
    moonNakshatra: NAKSHATRA_NAMES[nakshatraIndex],
    moonNakshatraIndex: nakshatraIndex,
    birthMahadashaLord: birthLord,
    balanceYearsAtBirth,
  };
}

export interface CalculateDashaOptions {
  moonLongitude: number;
  birthDate: string;
  birthTime: string;
  timezone?: number;
  /** Сколько полных 120-летних циклов махадаш сгенерировать (по умолчанию 2) */
  cycles?: number;
}

/** Полная последовательность махадаш от рождения */
export function calculateMahadashas(options: CalculateDashaOptions): DashaPeriod[] {
  const {
    moonLongitude,
    birthDate,
    birthTime,
    timezone = 0,
    cycles = 2,
  } = options;

  const meta = getMoonNakshatraMeta(moonLongitude);
  const birthMs = parseBirthUtcMs(birthDate, birthTime, timezone);

  const dashas: DashaPeriod[] = [];
  let cursorMs = birthMs;
  let lordIdx = dashaLordIndex(meta.birthMahadashaLord);
  let remainingYears = meta.balanceYearsAtBirth;

  const totalMahadashas = 9 * cycles;

  for (let i = 0; i < totalMahadashas; i++) {
    const planet = DASHA_LORDS[lordIdx];
    const years = i === 0 ? remainingYears : DASHA_YEARS[planet];
    const endMs = addDashaYears(cursorMs, years);

    dashas.push({
      planet,
      startDate: formatDashaDateLocal(cursorMs, timezone),
      endDate: formatDashaDateLocal(endMs, timezone),
      duration: `${years.toFixed(2)} лет`,
      startMs: cursorMs,
      endMs,
    });

    cursorMs = endMs;
    lordIdx = (lordIdx + 1) % 9;
    remainingYears = DASHA_YEARS[DASHA_LORDS[lordIdx]];
  }

  return dashas;
}

export function calculateAntardashas(
  mahadashaPlanet: string,
  mahadashaStartMs: number,
  mahadashaYears: number,
  timezone = 0
): AntardashaPeriod[] {
  const mahaIdx = dashaLordIndex(mahadashaPlanet);
  const mahaYears = DASHA_YEARS[mahadashaPlanet as (typeof DASHA_LORDS)[number]] ?? mahadashaYears;
  const periods: AntardashaPeriod[] = [];
  let cursorMs = mahadashaStartMs;

  for (let i = 0; i < 9; i++) {
    const lordIdx = (mahaIdx + i) % 9;
    const planet = DASHA_LORDS[lordIdx];
    const antarYears = (mahaYears * DASHA_YEARS[planet]) / 120;
    const endMs = addDashaYears(cursorMs, antarYears);

    periods.push({
      planet,
      startDate: formatDashaDateLocal(cursorMs, timezone),
      endDate: formatDashaDateLocal(endMs, timezone),
      startMs: cursorMs,
      endMs,
    });

    cursorMs = endMs;
  }

  return periods;
}

export function findActiveMahadasha(
  mahadashas: DashaPeriod[],
  atMs: number = Date.now()
): DashaPeriod | null {
  return (
    mahadashas.find((d) => atMs >= d.startMs && atMs < d.endMs) ??
    mahadashas[mahadashas.length - 1] ??
    null
  );
}

export function findActiveAntardasha(
  antardashas: AntardashaPeriod[],
  atMs: number = Date.now()
): AntardashaPeriod | null {
  return (
    antardashas.find((d) => atMs >= d.startMs && atMs < d.endMs) ??
    antardashas[antardashas.length - 1] ??
    null
  );
}

export function getActiveVimshottariDasha(
  options: CalculateDashaOptions,
  atMs: number = Date.now()
): ActiveVimshottariDasha | null {
  const timezone = options.timezone ?? 0;
  const meta = getMoonNakshatraMeta(options.moonLongitude);
  const mahadashas = calculateMahadashas(options);
  const mahadasha = findActiveMahadasha(mahadashas, atMs);
  if (!mahadasha) return null;

  const mahaYears = DASHA_YEARS[mahadasha.planet as (typeof DASHA_LORDS)[number]];
  const antardashas = calculateAntardashas(
    mahadasha.planet,
    mahadasha.startMs,
    mahaYears,
    timezone
  );
  const antardasha = findActiveAntardasha(antardashas, atMs);
  if (!antardasha) return null;

  return { mahadasha, antardasha, meta };
}

/** Текст для промпта ИИ (вопросы 9, 11, 16 и общий чат) */
export function formatVimshottariForPrompt(
  options: CalculateDashaOptions,
  atMs: number = Date.now()
): string {
  const active = getActiveVimshottariDasha(options, atMs);
  if (!active) return 'Вимшоттари даша: не удалось рассчитать.';

  const { mahadasha, antardasha, meta } = active;
  const today = formatDashaDateLocal(atMs, options.timezone ?? 0);
  const upcoming = calculateMahadashas(options)
    .filter((d) => d.startMs >= atMs)
    .slice(0, 3);

  const lines = [
    `Вимшоттари даша (расчёт по сидерической Луне ${normalizeLongitude(options.moonLongitude).toFixed(4)}°, дата рождения ${options.birthDate} ${options.birthTime}):`,
    `Накшатра Луны при рождении: ${meta.moonNakshatra}; первая махадаша с рождения: ${meta.birthMahadashaLord} (остаток ${meta.balanceYearsAtBirth.toFixed(2)} лет).`,
    `На дату ${today}: махадаша ${mahadasha.planet} (${mahadasha.startDate} — ${mahadasha.endDate}), антардаша ${antardasha.planet} (${antardasha.startDate} — ${antardasha.endDate}).`,
    'Используй эти планеты периода для вопросов о жизненном этапе; положение планет в карте — отдельно из долгот D1.',
  ];

  if (upcoming.length > 0) {
    lines.push(
      'Ближайшие смены махадаши: ' +
        upcoming.map((d) => `${d.planet} с ${d.startDate}`).join('; ') +
        '.'
    );
  }

  return lines.join(' ');
}
