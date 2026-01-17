import { readFileSync } from 'fs';
import { join } from 'path';
import sequelize from '@/lib/db';

async function runMigration() {
  try {
    console.log('Загрузка SQL миграции...');
    const sqlPath = join(process.cwd(), 'migrations', 'create-natal-charts.sql');
    const sql = readFileSync(sqlPath, 'utf-8');
    
    console.log('Выполнение миграции...');
    // Разбиваем SQL на отдельные запросы (убираем комментарии и пустые строки)
    const queries = sql
      .split(';')
      .map(q => q.trim())
      .filter(q => q.length > 0 && !q.startsWith('--'));
    
    for (const query of queries) {
      if (query.trim()) {
        await sequelize.query(query);
        console.log('✓ Выполнен запрос');
      }
    }
    
    console.log('✅ Миграция успешно выполнена!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Ошибка при выполнении миграции:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
