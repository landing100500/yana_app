/**
 * Перебор всех режимов аянамши Swiss Ephemeris для тестовых данных.
 * Запуск: npx tsx scripts/test-ayanamsa-modes.ts
 *
 * Эталон (vedic-horo): Норильск 25.07.1979 14:00 → Асцендент 29°15'19" Дева (179.255°)
 */
const sw = require('swisseph') as typeof import('swisseph');
const path = require('path');

// Путь к ephe (для высоких широт иногда нужен)
const ephePath = path.join(__dirname, '..', 'node_modules', 'swisseph', 'ephe');
try { sw.swe_set_ephe_path(ephePath); } catch (_) {}

const JD = sw.swe_julday(1979, 7, 25, 7.0, sw.SE_GREG_CAL); // 14:00 Norilsk = 07:00 UTC
const LAT = 69.35;   // 69°21' N
const LON = 88.2;    // 88°12' E
const TARGET = 150 + 29 + 15 / 60 + 19 / 3600; // 29°15'19" Virgo

// На высоких широтах Placidus может дать ошибку — используем Equal (E)
const r = sw.swe_houses(JD, LAT, LON, 'E');
const tropicalAsc = (r && (r as any).ascendant != null) ? (r as any).ascendant : (r && (r as any).ascmc && (r as any).ascmc[0]);

const modeNames: Record<number, string> = {};
for (const k of Object.keys(sw)) {
  if (k.startsWith('SE_SIDM_') && typeof (sw as any)[k] === 'number') {
    modeNames[(sw as any)[k]] = k.replace('SE_SIDM_', '');
  }
}

console.log('Target: 29°15\'19" Virgo =', TARGET.toFixed(4), 'sidereal\n');
console.log('Mode id | Name              | Ayanamsa | Sidereal asc | Diff from target');
console.log('--------|-------------------|----------|--------------|------------------');

const results: { id: number; name: string; aya: number; sid: number; diff: number }[] = [];

for (let id = 0; id <= 42; id++) {
  try {
    sw.swe_set_sid_mode(id, 0, 0);
    const aya = sw.swe_get_ayanamsa(JD);
    const sid = (tropicalAsc - aya + 360) % 360;
    const diff = Math.abs(sid - TARGET);
    const name = modeNames[id] || `#${id}`;
    results.push({ id, name, aya, sid, diff });
  } catch {
    // skip invalid mode
  }
}

results.sort((a, b) => a.diff - b.diff);

const signs = ['Ari','Tau','Gem','Cnc','Leo','Vir','Lib','Sco','Sag','Cap','Aqu','Pis'];
for (const r of results.slice(0, 15)) {
  const signIdx = Math.floor(r.sid / 30) % 12;
  const degInSign = r.sid % 30;
  const ascStr = `${signs[signIdx]} ${degInSign.toFixed(2)}°`;
  console.log(
    `${String(r.id).padStart(6)} | ${r.name.padEnd(17)} | ${r.aya.toFixed(2).padStart(8)} | ${ascStr.padEnd(12)} | ${r.diff.toFixed(3)}`
  );
}

console.log('\nЛучший режим для совпадения с эталоном:', results[0]?.name, '(id', results[0]?.id + ')');
console.log('Задать в .env: NATAL_CHART_AYANAMSA=' + (results[0]?.name ?? 'LAHIRI'));
console.log('Примечание: для высоких широт (Норильск) в приложении используется Equal houses (E).');
