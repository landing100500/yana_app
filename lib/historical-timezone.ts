/**
 * Исторический часовой пояс по координатам и дате (IANA + moment-timezone).
 * Опционально: местное среднее время (LMT) для совпадения с сервисами вроде vedic-horo.ru.
 *
 * geo-tz читает папку data/ с диска. Задаём GEO_TZ_DATA_PATH до первого require('geo-tz'):
 * сначала пробуем process.cwd() (надёжно на VPS), затем require.resolve.
 */
const path = require('path') as typeof import('path');
const fs = require('fs') as typeof import('fs');

let geoFind: (lat: number, lon: number) => string[] | undefined;
let momentTz: typeof import('moment-timezone') | null = null;

function ensureGeoTzDataPath(): void {
  if (process.env.GEO_TZ_DATA_PATH) return;
  const cwdData = path.join(process.cwd(), 'node_modules', 'geo-tz', 'data');
  if (fs.existsSync(cwdData)) {
    process.env.GEO_TZ_DATA_PATH = cwdData;
    return;
  }
  try {
    const pkgPath = require.resolve('geo-tz/package.json');
    const dataPath = path.join(path.dirname(pkgPath), 'data');
    if (fs.existsSync(dataPath)) process.env.GEO_TZ_DATA_PATH = dataPath;
  } catch (_) {}
}

ensureGeoTzDataPath();

function loadGeo(): (lat: number, lon: number) => string[] | undefined {
  if (geoFind) return geoFind;
  try {
    const geo = require('geo-tz');
    geoFind = geo.find ?? geo;
    return geoFind;
  } catch {
    return () => undefined;
  }
}

function loadMoment(): typeof import('moment-timezone') | null {
  if (momentTz) return momentTz;
  try {
    momentTz = require('moment-timezone');
    return momentTz;
  } catch {
    return null;
  }
}

/** Использовать местное среднее время (LMT): offset = долгота/15. */
const USE_LMT_FOR_BIRTH_TIME = process.env.NATAL_CHART_USE_LMT === 'true';

/**
 * Смещение в часах для LMT: 1 час = 15° долготы (восток положительный).
 */
function getLmtOffsetHours(longitude: number): number {
  return longitude / 15;
}

/**
 * Возвращает смещение часового пояса в часах (положительное = восток от UTC).
 * Только geo-tz + moment-timezone; при ошибке — null (вызывающий код использует coords.timezone).
 */
export function getHistoricalTimezoneOffset(
  lat: number,
  lon: number,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): number | null {
  if (USE_LMT_FOR_BIRTH_TIME) {
    return getLmtOffsetHours(lon);
  }
  try {
    const find = loadGeo();
    const zones = find(lat, lon);
    if (!zones || zones.length === 0) return null;
    const zone = zones[0];
    const m = loadMoment();
    if (!m) return null;
    const momentObj = m.tz(
      { year, month: month - 1, date: day, hour, minute },
      zone
    );
    if (!momentObj.isValid()) return null;
    const offsetMinutes = momentObj.utcOffset();
    return offsetMinutes / 60;
  } catch {
    return null;
  }
}
