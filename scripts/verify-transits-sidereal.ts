/**
 * Сверка транзитов: сидерика Лахири (тропик − ayanamsa) vs ожидаемые знаки.
 * Запуск: npx tsx scripts/verify-transits-sidereal.ts
 */
import { calculateTransitPositions } from '../lib/transit-calculator';

const RASHI = [
  'Овен',
  'Телец',
  'Близнецы',
  'Рак',
  'Лев',
  'Дева',
  'Весы',
  'Скорпион',
  'Стрелец',
  'Козерог',
  'Водолей',
  'Рыбы',
];

async function main() {
  const cases = [
    {
      label: '2022-03-15 12:00 UTC+3',
      moment: {
        year: 2022,
        month: 3,
        day: 15,
        hour: 12,
        minute: 0,
        latitude: 55.75,
        longitude: 37.62,
        timezone: 3,
      },
      expect: { jupiter: 'Водолей', saturn: 'Козерог' },
    },
    {
      label: '2026-06-02 12:00 UTC+3',
      moment: {
        year: 2026,
        month: 6,
        day: 2,
        hour: 12,
        minute: 0,
        latitude: 55.75,
        longitude: 37.62,
        timezone: 3,
      },
      expect: { jupiter: 'Рак', saturn: 'Рыбы' },
    },
  ];

  for (const c of cases) {
    const r = await calculateTransitPositions({
      transitMoment: c.moment,
      natalMoonLongitude: 0,
      natalAscendantLongitude: 0,
    });
    console.log(`\n=== ${c.label} ===`);
    for (const key of ['jupiter', 'saturn'] as const) {
      const p = r.planets.find((x) => x.key === key)!;
      const rashi = RASHI[p.signIndex];
      const ok = rashi === c.expect[key];
      console.log(
        `${p.label}: ${rashi} (${p.signNameSidereal}) ${p.degreeInSign.toFixed(2)}° | накш. ${p.nakshatraName} п.${p.nakshatraPada} | ${ok ? 'OK' : `FAIL (ожид. ${c.expect[key]})`}`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
