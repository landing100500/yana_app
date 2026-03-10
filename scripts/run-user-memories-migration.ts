import { readFileSync } from 'fs';
import { join } from 'path';
import sequelize from '@/lib/db';

async function runMigration() {
  try {
    console.log('Загрузка SQL миграции create-user-memories-and-topic-summaries...');
    const sqlPath = join(process.cwd(), 'migrations', 'create-user-memories-and-topic-summaries.sql');
    const sql = readFileSync(sqlPath, 'utf-8');

    console.log('Выполнение миграции...');
    const queries = sql
      .split(';')
      .map((q) => q.trim())
      .filter((q) => q.length > 0 && !q.startsWith('--'));

    for (const query of queries) {
      if (query.trim()) {
        await sequelize.query(query);
        console.log('✓ Выполнен запрос');
      }
    }

    console.log('✅ Миграция user_memories и chat_topic_summaries выполнена!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Ошибка при выполнении миграции:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
