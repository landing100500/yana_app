/**
 * Выполняется один раз при старте Node-сервера Next.js (до любого API/кода).
 * Задаём GEO_TZ_DATA_PATH, чтобы geo-tz на VPS находил папку data/ и не возвращал [].
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.GEO_TZ_DATA_PATH) return;

  const path = require('path');
  const fs = require('fs');

  // 1) process.cwd() — на VPS при запуске из корня проекта это надёжный путь
  const cwdData = path.join(process.cwd(), 'node_modules', 'geo-tz', 'data');
  if (fs.existsSync(cwdData)) {
    process.env.GEO_TZ_DATA_PATH = cwdData;
    return;
  }

  // 2) require.resolve — путь к пакету в текущем процессе (на случай другого cwd)
  try {
    const pkgPath = require.resolve('geo-tz/package.json');
    const dataPath = path.join(path.dirname(pkgPath), 'data');
    if (fs.existsSync(dataPath)) {
      process.env.GEO_TZ_DATA_PATH = dataPath;
    }
  } catch (_) {
    // geo-tz не установлен
  }
}
