import { readFileSync } from 'fs';
import { join } from 'path';
import sequelize from '@/lib/db';

async function runBackfill() {
  try {
    console.log('Загрузка backfill-plan-manually-assigned-at...');
    const sqlPath = join(
      process.cwd(),
      'migrations',
      'backfill-plan-manually-assigned-at.sql'
    );
    const sql = readFileSync(sqlPath, 'utf-8');

    const queries = sql
      .split(';')
      .map((q) =>
        q
          .split('\n')
          .filter((line) => !line.trim().startsWith('--'))
          .join('\n')
          .trim()
      )
      .filter((q) => q.length > 0);

    for (const query of queries) {
      const [result] = await sequelize.query(query);
      const meta = result as { affectedRows?: number };
      const affected = meta?.affectedRows ?? (result as unknown);
      console.log('✓ Обновлено строк:', affected);
    }

    console.log('✅ Backfill planManuallyAssignedAt завершён');
    process.exit(0);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('❌ Ошибка backfill:', err.message);
    console.error(error);
    process.exit(1);
  }
}

runBackfill();
