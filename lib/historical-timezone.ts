/**
 * Исторический часовой пояс по координатам и дате (IANA + moment-timezone).
 * Опционально: местное среднее время (LMT) для совпадения с сервисами вроде vedic-horo.ru.
 *
 * Важно: geo-tz читает папку data/ с диска. В продакшене (Next.js, другой cwd, PM2)
 * __dirname внутри geo-tz может указывать не туда, и find() возвращает [].
 * Задаём GEO_TZ_DATA_PATH до первого require('geo-tz'), чтобы путь к data был верным везде.
 */
const path = require('path') as typeof import('path');

let geoFind: (lat: number, lon: number) => string[] | undefined;
let momentTz: typeof import('moment-timezone') | null = null;

function ensureGeoTzDataPath(): void {
  if (process.env.GEO_TZ_DATA_PATH) return;
  try {
    const pkgPath = require.resolve('geo-tz/package.json');
    const dataPath = path.join(path.dirname(pkgPath), 'data');
    process.env.GEO_TZ_DATA_PATH = dataPath;
  } catch (_) {
    // geo-tz не установлен или путь не резолвится
  }
}

// Задать путь до первого require('geo-tz') в процессе (критично для VPS/Next.js)
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
 * Резервные оффсеты (UTC) для регионов, когда geo-tz/moment не находят зону (например на части VPS).
 * Границы приблизительные: [lonMin, lonMax, latMin, latMax] => offset.
 */
const FALLBACK_OFFSETS: Array<[number, number, number, number, number]> = [
  [82.5, 97.5, 65, 78, 7],   // Красноярский край, Норильск (Asia/Krasnoyarsk UTC+7)
  [37.5, 52.5, 55, 70, 3],   // Москва (Europe/Moscow UTC+3)
  [60, 75, 55, 70, 5],       // Екатеринбург (Asia/Yekaterinburg UTC+5)
  [30, 45, 44, 52, 2],       // Киев/Минск (UTC+2)
];

function getFallbackOffset(lat: number, lon: number): number | null {
  for (const [lonMin, lonMax, latMin, latMax, offset] of FALLBACK_OFFSETS) {
    if (lon >= lonMin && lon <= lonMax && lat >= latMin && lat <= latMax) return offset;
  }
  return null;
}

/**
 * Возвращает смещение часового пояса в часах (положительное = восток от UTC)
 * для данной точки (lat, lon) на указанную дату/время.
 * Используется: UTC = local_time - offset_hours.
 * При ошибке возвращает null (используется запасной вариант по долготе).
 *
 * Если NATAL_CHART_USE_LMT=true — используется местное среднее время (LMT),
 * что часто совпадает с vedic-horo.ru и другими ведическими расчётами.
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
    if (!zones || zones.length === 0) {
      const fallback = getFallbackOffset(lat, lon);
      if (fallback != null) {
        if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') {
          console.warn('Исторический пояс: geo-tz не вернул зону, использован резерв по региону:', { lat, lon, offset: fallback });
        }
        return fallback;
      }
      return null;
    }
    const zone = zones[0];
    const m = loadMoment();
    if (!m) {
      const fallback = getFallbackOffset(lat, lon);
      if (fallback != null) {
        if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') {
          console.warn('Исторический пояс: moment недоступен, использован резерв по региону:', { lat, lon, offset: fallback });
        }
        return fallback;
      }
      return null;
    }
    const momentObj = m.tz(
      { year, month: month - 1, date: day, hour, minute },
      zone
    );
    if (!momentObj.isValid()) {
      const fallback = getFallbackOffset(lat, lon);
      if (fallback != null) {
        if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') {
          console.warn('Исторический пояс: момент невалиден для зоны', zone, ', использован резерв:', { lat, lon, offset: fallback });
        }
        return fallback;
      }
      return null;
    }
    const offsetMinutes = momentObj.utcOffset();
    return offsetMinutes / 60;
  } catch {
    const fallback = getFallbackOffset(lat, lon);
    if (fallback != null) {
      if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') {
        console.warn('Исторический пояс: ошибка, использован резерв по региону:', { lat, lon, offset: fallback });
      }
      return fallback;
    }
    return null;
  }
}
