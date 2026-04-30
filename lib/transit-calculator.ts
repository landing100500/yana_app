/**
 * Транзиты: сидерические позиции планет на момент времени (Swiss Ephemeris)
 * и дома целознаковые от знака натальной Луны и от знака натального асцендента.
 */
const path = require('path');

import type { BirthData } from '@/lib/natal-chart-calculator';

async function getSwisseph() {
  if (typeof window === 'undefined') {
    return require('swisseph');
  }
  throw new Error('Swiss Ephemeris can only be used on the server');
}

function setSwissephEphePath(swisseph: any) {
  if (typeof swisseph.swe_set_ephe_path !== 'function') return;
  const envPath = process.env.SWISSEPH_EPHE_PATH;
  const candidates = envPath
    ? [envPath]
    : [
        path.join(process.cwd(), 'node_modules', 'swisseph', 'ephe'),
        path.join(process.cwd(), 'swisseph', 'ephe'),
        path.join(__dirname, '..', 'node_modules', 'swisseph', 'ephe'),
      ];
  for (const ephePath of candidates) {
    try {
      swisseph.swe_set_ephe_path(ephePath);
      return;
    } catch (_) {
      /* ignore */
    }
  }
}

function localCivilToUtcParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: number
) {
  let hourUTC = hour - timezone;
  let dayUTC = day;
  let monthUTC = month;
  let yearUTC = year;
  if (hourUTC < 0) {
    hourUTC += 24;
    dayUTC -= 1;
    if (dayUTC < 1) {
      monthUTC -= 1;
      if (monthUTC < 1) {
        monthUTC = 12;
        yearUTC -= 1;
      }
      const daysInMonth = new Date(yearUTC, monthUTC, 0).getDate();
      dayUTC = daysInMonth;
    }
  } else if (hourUTC >= 24) {
    hourUTC -= 24;
    dayUTC += 1;
    const daysInMonth = new Date(yearUTC, monthUTC, 0).getDate();
    if (dayUTC > daysInMonth) {
      dayUTC = 1;
      monthUTC += 1;
      if (monthUTC > 12) {
        monthUTC = 1;
        yearUTC += 1;
      }
    }
  }
  return { yearUTC, monthUTC, dayUTC, hourUTC };
}

/** Целознаковый дом от опорной точки (Лагна или Чандра-лагна): знак референса = 1-й дом */
export function wholeSignHouseFromReference(planetLongitude: number, referenceLongitude: number): number {
  let p = planetLongitude % 360;
  if (p < 0) p += 360;
  let r = referenceLongitude % 360;
  if (r < 0) r += 360;
  const planetSign = Math.floor(p / 30) % 12;
  const refSign = Math.floor(r / 30) % 12;
  return ((planetSign - refSign + 12) % 12) + 1;
}

export interface TransitPlanetRow {
  key: string;
  label: string;
  longitude: number;
  signIndex: number;
  signNameSidereal: string;
  degreeInSign: number;
  isRetrograde: boolean;
  houseFromMoon: number;
  houseFromAscendant: number;
}

const SIGN_NAMES_SIDEREAL = [
  'Меша',
  'Вришабха',
  'Митхуна',
  'Карка',
  'Симха',
  'Канья',
  'Тула',
  'Вришчика',
  'Дхану',
  'Макара',
  'Кумбха',
  'Мина',
];

export interface TransitCalculationResult {
  julianDay: number;
  transitLocalLabel: string;
  planets: TransitPlanetRow[];
}

export interface TransitIngressWindow {
  from: string;
  to: string;
  signIndex: number;
  signNameSidereal: string;
}

export interface TransitIngressTimelineRow {
  key: string;
  label: string;
  windows: TransitIngressWindow[];
}

function longitudeToSignParts(longitude: number): { signIndex: number; degreeInSign: number; signName: string } {
  let n = longitude % 360;
  if (n < 0) n += 360;
  const signIndex = Math.floor(n / 30) % 12;
  return {
    signIndex,
    degreeInSign: n % 30,
    signName: SIGN_NAMES_SIDEREAL[signIndex],
  };
}

const PLANET_LABELS: Record<string, string> = {
  sun: 'Солнце',
  moon: 'Луна',
  mars: 'Марс',
  mercury: 'Меркурий',
  jupiter: 'Юпитер',
  venus: 'Венера',
  saturn: 'Сатурн',
  uranus: 'Уран',
  neptune: 'Нептун',
  pluto: 'Плутон',
  northNode: 'Раху',
};

function getAyanamsa(swisseph: any): number {
  const ayanamsaEnv = (process.env.NATAL_CHART_AYANAMSA || 'LAHIRI').toUpperCase().replace(/-/g, '_');
  const ayanamsaMap: Record<string, number> = {
    FAGAN_BRADLEY: swisseph.SE_SIDM_FAGAN_BRADLEY,
    LAHIRI: swisseph.SE_SIDM_LAHIRI,
    DELUCE: swisseph.SE_SIDM_DELUCE,
    RAMAN: swisseph.SE_SIDM_RAMAN,
    USHASHASHI: swisseph.SE_SIDM_USHASHASHI,
    KRISHNAMURTI: swisseph.SE_SIDM_KRISHNAMURTI,
    YUKTESHWAR: swisseph.SE_SIDM_YUKTESHWAR,
    TRUE_CITRA: swisseph.SE_SIDM_TRUE_CITRA,
    SS_CITRA: swisseph.SE_SIDM_SS_CITRA,
    SURYASIDDHANTA: swisseph.SE_SIDM_SURYASIDDHANTA,
    SS_REVATI: swisseph.SE_SIDM_SS_REVATI,
    TRUE_REVATI: swisseph.SE_SIDM_TRUE_REVATI,
    TRUE_PUSHYA: swisseph.SE_SIDM_TRUE_PUSHYA,
    TRUE_MULA: swisseph.SE_SIDM_TRUE_MULA,
    ARYABHATA: swisseph.SE_SIDM_ARYABHATA,
  };
  return ayanamsaMap[ayanamsaEnv] ?? swisseph.SE_SIDM_LAHIRI;
}

function toJdFromLocalDateParts(swisseph: any, date: { year: number; month: number; day: number }, timezone: number): number {
  const utcHour = -timezone;
  return swisseph.swe_julday(date.year, date.month, date.day, utcHour, swisseph.SE_GREG_CAL);
}

function formatJdAsLocalIso(swisseph: any, jd: number, timezone: number): string {
  const utc = swisseph.swe_revjul(jd, swisseph.SE_GREG_CAL);
  if (!utc || !Array.isArray(utc) || utc.length < 4) {
    throw new Error('Не удалось преобразовать Julian Day');
  }
  let year = utc[0] as number;
  let month = utc[1] as number;
  let day = utc[2] as number;
  const hourWithFraction = (utc[3] as number) + timezone;
  const dayMs = 24 * 60 * 60 * 1000;
  const baseUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  const shiftedMs = baseUtcMs + hourWithFraction * 60 * 60 * 1000;
  const shifted = new Date(shiftedMs);
  year = shifted.getUTCFullYear();
  month = shifted.getUTCMonth() + 1;
  day = shifted.getUTCDate();
  const minutesInDay = Math.max(0, Math.min(24 * 60 - 1, Math.round((shiftedMs % dayMs + dayMs) % dayMs / 60000)));
  const hh = Math.floor(minutesInDay / 60);
  const mm = minutesInDay % 60;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(
    hh
  ).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function normalizeSignIndex(i: number): number {
  const n = i % 12;
  return n < 0 ? n + 12 : n;
}

function signAtJd(swisseph: any, jd: number, planetId: number, flags: number): number {
  const result = swisseph.swe_calc_ut(jd, planetId, flags);
  const lon = result?.xx?.[0];
  if (typeof lon !== 'number' || Number.isNaN(lon)) {
    throw new Error(`Не удалось получить долготу для планеты ${planetId}`);
  }
  return normalizeSignIndex(Math.floor((((lon % 360) + 360) % 360) / 30));
}

function resolvePlanetId(swisseph: any, key: string): number {
  const map: Record<string, number> = {
    sun: swisseph.SE_SUN,
    moon: swisseph.SE_MOON,
    mars: swisseph.SE_MARS,
    mercury: swisseph.SE_MERCURY,
    jupiter: swisseph.SE_JUPITER,
    venus: swisseph.SE_VENUS,
    saturn: swisseph.SE_SATURN,
    uranus: swisseph.SE_URANUS,
    neptune: swisseph.SE_NEPTUNE,
    pluto: swisseph.SE_PLUTO,
    northNode: swisseph.SE_TRUE_NODE,
  };
  const id = map[key];
  if (typeof id !== 'number') {
    throw new Error(`Неизвестная планета для транзитов: ${key}`);
  }
  return id;
}

export async function calculateTransitPositions(params: {
  transitMoment: BirthData;
  natalMoonLongitude: number;
  natalAscendantLongitude: number;
}): Promise<TransitCalculationResult> {
  const swisseph = await getSwisseph();
  setSwissephEphePath(swisseph);

  const { yearUTC, monthUTC, dayUTC, hourUTC } = localCivilToUtcParts(
    params.transitMoment.year,
    params.transitMoment.month,
    params.transitMoment.day,
    params.transitMoment.hour,
    params.transitMoment.minute,
    params.transitMoment.timezone
  );

  const julianDay = swisseph.swe_julday(
    yearUTC,
    monthUTC,
    dayUTC,
    hourUTC + params.transitMoment.minute / 60,
    swisseph.SE_GREG_CAL
  );

  const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED | swisseph.SEFLG_SIDEREAL;

  swisseph.swe_set_sid_mode(getAyanamsa(swisseph), 0, 0);

  const readPlanet = (planetId: number): { longitude: number; speed: number } => {
    const result = swisseph.swe_calc_ut(julianDay, planetId, flags);
    if (!result) throw new Error(`Нет данных для планеты ${planetId}`);
    let longitude: number;
    let speed = 0;
    if (result.xx && Array.isArray(result.xx) && result.xx.length > 0) {
      longitude = result.xx[0];
      speed = result.xx[3] || 0;
    } else if (Array.isArray(result) && result.length > 0) {
      longitude = result[0];
      speed = result[3] || 0;
    } else if (typeof (result as any).longitude === 'number') {
      longitude = (result as any).longitude;
      speed = (result as any).speed || 0;
    } else {
      throw new Error(`Неверный ответ swisseph для планеты ${planetId}`);
    }
    if (longitude == null || Number.isNaN(longitude)) {
      throw new Error(`Пустая долгота для планеты ${planetId}`);
    }
    return { longitude, speed };
  };

  const natalMoon = params.natalMoonLongitude;
  const natalAsc = params.natalAscendantLongitude;

  const order: { key: string; label: string; id: number }[] = [
    { key: 'sun', label: 'Солнце', id: swisseph.SE_SUN },
    { key: 'moon', label: 'Луна', id: swisseph.SE_MOON },
    { key: 'mars', label: 'Марс', id: swisseph.SE_MARS },
    { key: 'mercury', label: 'Меркурий', id: swisseph.SE_MERCURY },
    { key: 'jupiter', label: 'Юпитер', id: swisseph.SE_JUPITER },
    { key: 'venus', label: 'Венера', id: swisseph.SE_VENUS },
    { key: 'saturn', label: 'Сатурн', id: swisseph.SE_SATURN },
    { key: 'uranus', label: 'Уран', id: swisseph.SE_URANUS },
    { key: 'neptune', label: 'Нептун', id: swisseph.SE_NEPTUNE },
    { key: 'pluto', label: 'Плутон', id: swisseph.SE_PLUTO },
  ];

  const planets: TransitPlanetRow[] = [];

  for (const row of order) {
    const { longitude, speed } = readPlanet(row.id);
    const parts = longitudeToSignParts(longitude);
    planets.push({
      key: row.key,
      label: row.label,
      longitude,
      signIndex: parts.signIndex,
      signNameSidereal: parts.signName,
      degreeInSign: parts.degreeInSign,
      isRetrograde: speed < 0,
      houseFromMoon: wholeSignHouseFromReference(longitude, natalMoon),
      houseFromAscendant: wholeSignHouseFromReference(longitude, natalAsc),
    });
  }

  const rahuData = readPlanet(swisseph.SE_TRUE_NODE);
  const rahuLong = rahuData.longitude;
  const nodeRetro = rahuData.speed < 0;
  const rahuParts = longitudeToSignParts(rahuLong);
  planets.push({
    key: 'northNode',
    label: 'Раху',
    longitude: rahuLong,
    signIndex: rahuParts.signIndex,
    signNameSidereal: rahuParts.signName,
    degreeInSign: rahuParts.degreeInSign,
    isRetrograde: nodeRetro,
    houseFromMoon: wholeSignHouseFromReference(rahuLong, natalMoon),
    houseFromAscendant: wholeSignHouseFromReference(rahuLong, natalAsc),
  });
  const ketuLong = (rahuLong + 180) % 360;
  const ketuParts = longitudeToSignParts(ketuLong);
  planets.push({
    key: 'southNode',
    label: 'Кету',
    longitude: ketuLong,
    signIndex: ketuParts.signIndex,
    signNameSidereal: ketuParts.signName,
    degreeInSign: ketuParts.degreeInSign,
    isRetrograde: nodeRetro,
    houseFromMoon: wholeSignHouseFromReference(ketuLong, natalMoon),
    houseFromAscendant: wholeSignHouseFromReference(ketuLong, natalAsc),
  });

  const transitLocalLabel = `${String(params.transitMoment.day).padStart(2, '0')}.${String(
    params.transitMoment.month
  ).padStart(2, '0')}.${params.transitMoment.year}, ${String(params.transitMoment.hour).padStart(2, '0')}:${String(
    params.transitMoment.minute
  ).padStart(2, '0')} (местное, UTC${params.transitMoment.timezone >= 0 ? '+' : ''}${params.transitMoment.timezone})`;

  return { julianDay, transitLocalLabel, planets };
}

export async function calculateTransitIngressTimeline(params: {
  fromLocalDate: { year: number; month: number; day: number };
  toLocalDate: { year: number; month: number; day: number };
  timezone: number;
  planets: string[];
  stepHours?: number;
}): Promise<TransitIngressTimelineRow[]> {
  const swisseph = await getSwisseph();
  setSwissephEphePath(swisseph);
  swisseph.swe_set_sid_mode(getAyanamsa(swisseph), 0, 0);
  const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SIDEREAL;
  const stepHours = Math.max(1, Math.min(24, Math.floor(params.stepHours ?? 6)));
  const stepDays = stepHours / 24;

  const startJd = toJdFromLocalDateParts(swisseph, params.fromLocalDate, params.timezone);
  const endJd = toJdFromLocalDateParts(swisseph, params.toLocalDate, params.timezone) + 1;

  if (!Number.isFinite(startJd) || !Number.isFinite(endJd) || endJd <= startJd) {
    throw new Error('Неверный диапазон дат для расчёта транзитов');
  }

  const timeline: TransitIngressTimelineRow[] = [];

  for (const key of params.planets) {
    const planetId = resolvePlanetId(swisseph, key);
    const label = PLANET_LABELS[key] || key;
    let windowStart = startJd;
    let prevJd = startJd;
    let prevSign = signAtJd(swisseph, prevJd, planetId, flags);
    const windows: TransitIngressWindow[] = [];

    for (let t = startJd + stepDays; t <= endJd + 1e-9; t += stepDays) {
      const curJd = Math.min(t, endJd);
      const curSign = signAtJd(swisseph, curJd, planetId, flags);
      if (curSign !== prevSign) {
        let lo = prevJd;
        let hi = curJd;
        for (let i = 0; i < 40; i += 1) {
          const mid = (lo + hi) / 2;
          const midSign = signAtJd(swisseph, mid, planetId, flags);
          if (midSign === prevSign) lo = mid;
          else hi = mid;
          if ((hi - lo) * 24 * 60 < 1) break;
        }
        const ingressJd = hi;
        windows.push({
          from: formatJdAsLocalIso(swisseph, windowStart, params.timezone),
          to: formatJdAsLocalIso(swisseph, ingressJd, params.timezone),
          signIndex: prevSign,
          signNameSidereal: SIGN_NAMES_SIDEREAL[prevSign],
        });
        windowStart = ingressJd;
        prevSign = curSign;
      }
      prevJd = curJd;
    }

    windows.push({
      from: formatJdAsLocalIso(swisseph, windowStart, params.timezone),
      to: formatJdAsLocalIso(swisseph, endJd, params.timezone),
      signIndex: prevSign,
      signNameSidereal: SIGN_NAMES_SIDEREAL[prevSign],
    });

    timeline.push({ key, label, windows });
  }

  return timeline;
}
