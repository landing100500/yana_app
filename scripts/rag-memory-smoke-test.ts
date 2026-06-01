/**
 * Smoke-test RAG: fuzzy match имён, retry порога, fetchSectionChunks.
 * Запуск: npx tsx scripts/rag-memory-smoke-test.ts
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

async function main() {
  const {
    findSectionByName,
    fetchSectionChunks,
    normalizeSectionNameForMatch,
    scoreSectionNameMatch,
  } = await import('../lib/rag-search');

  type Row = { label: string; ok: boolean; detail: string };
  const results: Row[] = [];
  let failed = 0;

  const assert = (label: string, ok: boolean, detail: string) => {
    results.push({ label, ok, detail });
    if (!ok) failed += 1;
  };

  const fuzzyCases = [
    { code: 'Овен книга про тип характера', mustContain: 'овен' },
    { code: 'Близнецы книга', mustContain: 'близнец' },
    { code: 'Сила и поражение планет', mustContain: 'сила' },
    { code: 'Пример расчета чаракарок', mustContain: 'чара' },
  ];

  for (const { code, mustContain } of fuzzyCases) {
    const section = await findSectionByName(code);
    const ok =
      !!section && normalizeSectionNameForMatch(section.name).includes(mustContain);
    assert(`fuzzy find: ${code}`, ok, section ? `→ "${section.name}"` : 'not found');
  }

  assert(
    'exact: ПРЕДСКАЗАНИЕ',
    !!(await findSectionByName('ПРЕДСКАЗАНИЕ')),
    'required section'
  );

  assert(
    'scoreSectionNameMatch',
    scoreSectionNameMatch('Близнецы книга', 'БЛИЗНЕЦЫ Книга про тип характера') >= 45,
    'ascendant book alias'
  );

  const predFallback = await fetchSectionChunks(
    'ПРЕДСКАЗАНИЕ',
    ['транзит прогноз предсказание период ретроград гочар'],
    5
  );
  assert(
    'ПРЕДСКАЗАНИЕ fallback chunks',
    predFallback.status === 'ok' && predFallback.chunks.length > 0,
    `status=${predFallback.status}, chunks=${predFallback.chunks.length}`
  );

  const predUser = await fetchSectionChunks('ПРЕДСКАЗАНИЕ', ['что меня ждет по транзитам'], 5);
  assert(
    'ПРЕДСКАЗАНИЕ user-like query',
    predUser.status === 'ok' && predUser.chunks.length > 0,
    `status=${predUser.status}, chunks=${predUser.chunks.length}`
  );

  const chart = await fetchSectionChunks(
    'Как трактовать карту - 1 часть',
    ['натальная карта трактовка расшифровка'],
    5
  );
  assert(
    'трактовка карты fallback',
    chart.status === 'ok' && chart.chunks.length > 0,
    `status=${chart.status}, chunks=${chart.chunks.length}`
  );

  const missing = await fetchSectionChunks('___нет_такого_раздела___', ['test'], 3);
  assert('missing section status', missing.status === 'not_found', `status=${missing.status}`);

  console.log('\n=== RAG memory smoke test ===\n');
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.label}: ${r.detail}`);
  }
  console.log(`\n${results.length - failed}/${results.length} passed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
