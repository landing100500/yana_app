import { readFileSync } from 'fs';
import { join } from 'path';
import sequelize from '@/lib/db';

async function runMigration() {
  try {
    console.log('Загрузка SQL миграции add-free-ai-requests-limit-to-users...');
    const sqlPath = join(
      process.cwd(),
      'migrations',
      'add-free-ai-requests-limit-to-users.sql'
    );
    const sql = readFileSync(sqlPath, 'utf-8');

    console.log('Выполнение миграции...');
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
      if (query.trim()) {
        await sequelize.query(query);
        console.log('✓ Выполнен запрос');
      }
    }

    console.log('✅ Миграция freeAiRequestsLimit успешно выполнена!');
    process.exit(0);
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes('Duplicate column')) {
      console.log('✅ Колонка freeAiRequestsLimit уже существует, миграция не требуется.');
      process.exit(0);
    }
    console.error('❌ Ошибка при выполнении миграции:', err.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
