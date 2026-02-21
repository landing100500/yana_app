/**
 * Выполняется один раз при старте Node-сервера Next.js (до любого API/кода).
 * Задаём GEO_TZ_DATA_PATH, чтобы geo-tz на VPS находил папку data/ и не возвращал [].
 * Без require('path'/'fs'), чтобы не ломать сборку webpack.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.GEO_TZ_DATA_PATH) return;

  const cwd = process.cwd();
  const cwdData = cwd + '/node_modules/geo-tz/data';
  process.env.GEO_TZ_DATA_PATH = cwdData;

  try {
    const pkgPath = require.resolve('geo-tz/package.json');
    process.env.GEO_TZ_DATA_PATH = pkgPath.replace(/package\.json$/i, 'data');
  } catch (_) {
    // остаётся cwdData
  }
}
