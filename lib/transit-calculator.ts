/**
 * Транзиты: сидерические позиции планет на момент времени (Swiss Ephemeris)
 * и дома целознаковые от знака натальной Луны и от знака натального асцендента.
 */
import type { BirthData } from '@/lib/natal-chart-calculator';
import {
  calcSiderealPlanetUt,
  configureSiderealMode,
  getSwisseph,
  localCivilToUtcParts,
  longitudeToSignParts,
  setSwissephEphePath,
  SIGN_NAMES_SIDEREAL,
} from '@/lib/swisseph-vedic';
import { longitudeToNakshatra } from '@/lib/vimshottari-dasha';

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
  nakshatraIndex: number;
  nakshatraName: string;
  nakshatraPada: number;
  nakshatraRuler: string;
  isRetrograde: boolean;
  houseFromMoon: number;
  houseFromAscendant: number;
}

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

function toJdFromLocalDateParts(swisseph: any, date: { year: number; month: number; day: number }, timezone: number): number {
  const utcHour = -timezone;
  return swisseph.swe_julday(date.year, date.month, date.day, utcHour, swisseph.SE_GREG_CAL);
}

function formatJdAsLocalIso(swisseph: any, jd: number, timezone: number): string {
  const utc = swisseph.swe_revjul(jd, swisseph.SE_GREG_CAL);
  let year: number;
  let month: number;
  let day: number;
  let hourFraction: number;
  if (utc && typeof utc === 'object' && 'year' in utc) {
    year = utc.year as number;
    month = utc.month as number;
    day = utc.day as number;
    hourFraction = utc.hour as number;
  } else if (utc && Array.isArray(utc) && utc.length >= 4) {
    year = utc[0] as number;
    month = utc[1] as number;
    day = utc[2] as number;
    hourFraction = utc[3] as number;
  } else {
    throw new Error('Не удалось преобразовать Julian Day');
  }
  const hourWithFraction = hourFraction + timezone;
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

function signAtJd(swisseph: any, jd: number, planetId: number): number {
  const { longitude } = calcSiderealPlanetUt(swisseph, jd, planetId);
  return normalizeSignIndex(Math.floor(longitude / 30));
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

function buildTransitRow(
  key: string,
  label: string,
  longitude: number,
  speed: number,
  natalMoon: number,
  natalAsc: number
): TransitPlanetRow {
  const parts = longitudeToSignParts(longitude);
  const nak = longitudeToNakshatra(longitude);
  return {
    key,
    label,
    longitude,
    signIndex: parts.signIndex,
    signNameSidereal: parts.signName,
    degreeInSign: parts.degreeInSign,
    nakshatraIndex: nak.nakshatraIndex,
    nakshatraName: nak.name,
    nakshatraPada: nak.pada,
    nakshatraRuler: nak.ruler,
    isRetrograde: speed < 0,
    houseFromMoon: wholeSignHouseFromReference(longitude, natalMoon),
    houseFromAscendant: wholeSignHouseFromReference(longitude, natalAsc),
  };
}

export async function calculateTransitPositions(params: {
  transitMoment: BirthData;
  natalMoonLongitude: number;
  natalAscendantLongitude: number;
}): Promise<TransitCalculationResult> {
  const swisseph = await getSwisseph();
  setSwissephEphePath(swisseph);
  configureSiderealMode(swisseph);

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

  const readPlanet = (planetId: number) => calcSiderealPlanetUt(swisseph, julianDay, planetId, { withSpeed: true });

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

  const planets: TransitPlanetRow[] = order.map((row) => {
    const { longitude, speed } = readPlanet(row.id);
    return buildTransitRow(row.key, row.label, longitude, speed, natalMoon, natalAsc);
  });

  const rahuData = readPlanet(swisseph.SE_TRUE_NODE);
  const rahuLong = rahuData.longitude;
  const nodeRetro = rahuData.speed < 0;
  planets.push(buildTransitRow('northNode', 'Раху', rahuLong, rahuData.speed, natalMoon, natalAsc));
  const ketuLong = (rahuLong + 180) % 360;
  planets.push(buildTransitRow('southNode', 'Кету', ketuLong, rahuData.speed, natalMoon, natalAsc));

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
  configureSiderealMode(swisseph);

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
    let prevSign = signAtJd(swisseph, prevJd, planetId);
    const windows: TransitIngressWindow[] = [];

    for (let t = startJd + stepDays; t <= endJd + 1e-9; t += stepDays) {
      const curJd = Math.min(t, endJd);
      const curSign = signAtJd(swisseph, curJd, planetId);
      if (curSign !== prevSign) {
        let lo = prevJd;
        let hi = curJd;
        for (let i = 0; i < 40; i += 1) {
          const mid = (lo + hi) / 2;
          const midSign = signAtJd(swisseph, mid, planetId);
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
