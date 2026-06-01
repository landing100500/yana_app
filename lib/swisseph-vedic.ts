/**
 * Общие функции Swiss Ephemeris для ведической (сидерической, Лахири) астрологии.
 * Позиции планет: тропик из swe_calc_ut, затем − ayanamsa (как Лагна и Jagannatha Hora).
 */
const path = require('path');

export async function getSwisseph() {
  if (typeof window === 'undefined') {
    return require('swisseph');
  }
  throw new Error('Swiss Ephemeris can only be used on the server');
}

export function setSwissephEphePath(swisseph: any) {
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

export function normalizeDegrees(longitude: number): number {
  let n = longitude % 360;
  if (n < 0) n += 360;
  return n;
}

export function getAyanamsaMode(swisseph: any): number {
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

export function configureSiderealMode(swisseph: any): void {
  swisseph.swe_set_sid_mode(getAyanamsaMode(swisseph), 0, 0);
}

export function readSwissCalcResult(result: any): { longitude: number; speed: number } {
  if (!result) {
    throw new Error('Пустой ответ Swiss Ephemeris');
  }

  let longitude: number | undefined;
  let speed = 0;

  if (result.xx && Array.isArray(result.xx) && result.xx.length > 0) {
    longitude = result.xx[0];
    speed = result.xx[3] ?? 0;
  } else if (Array.isArray(result) && result.length > 0) {
    longitude = result[0];
    speed = result[3] ?? 0;
  } else if (typeof result.longitude === 'number') {
    longitude = result.longitude;
    speed = result.longitudeSpeed ?? result.speed ?? 0;
  } else if (Array.isArray(result.longitude) && result.longitude.length > 0) {
    longitude = result.longitude[0];
    speed = result.longitudeSpeed ?? result.speed ?? 0;
  }

  if (longitude == null || Number.isNaN(longitude)) {
    throw new Error('Не удалось прочитать эклиптическую долготу из ответа Swiss Ephemeris');
  }

  return { longitude, speed };
}

/** Сидерическая долгота: тропик − ayanamsa (после configureSiderealMode). */
export function calcSiderealPlanetUt(
  swisseph: any,
  julianDay: number,
  planetId: number,
  options?: { withSpeed?: boolean }
): { longitude: number; speed: number } {
  const flags = swisseph.SEFLG_SWIEPH | (options?.withSpeed ? swisseph.SEFLG_SPEED : 0);
  const tropical = readSwissCalcResult(swisseph.swe_calc_ut(julianDay, planetId, flags));
  const ayanamsa = swisseph.swe_get_ayanamsa(julianDay);
  return {
    longitude: normalizeDegrees(tropical.longitude - ayanamsa),
    speed: tropical.speed,
  };
}

/** Текущий момент в фиксированном смещении от UTC (как timezone карты). */
export function utcNowToFixedOffsetLocal(timezoneHours: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const localMs = Date.now() + timezoneHours * 3600000;
  const d = new Date(localMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

export function localCivilToUtcParts(
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

export const SIGN_NAMES_SIDEREAL = [
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
] as const;

export function longitudeToSignParts(longitude: number): {
  signIndex: number;
  degreeInSign: number;
  signName: string;
} {
  const n = normalizeDegrees(longitude);
  const signIndex = Math.floor(n / 30) % 12;
  return {
    signIndex,
    degreeInSign: n % 30,
    signName: SIGN_NAMES_SIDEREAL[signIndex],
  };
}
