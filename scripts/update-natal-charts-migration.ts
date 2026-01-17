import { readFileSync } from 'fs';
import { join } from 'path';
import sequelize from '@/lib/db';

async function runMigration() {
  try {
    console.log('Загрузка SQL миграции для обновления структуры...');
    const sqlPath = join(process.cwd(), 'migrations', 'update-natal-charts-multiple.sql');
    const sql = readFileSync(sqlPath, 'utf-8');
    
    console.log('Выполнение миграции...');
    // Разбиваем SQL на отдельные запросы
    const queries = sql
      .split(';')
      .map(q => q.trim())
      .filter(q => q.length > 0 && !q.startsWith('--'));
    
    for (const query of queries) {
      if (query.trim()) {
        try {
          await sequelize.query(query);
          console.log('✓ Выполнен запрос');
        } catch (err: any) {
          // Игнорируем ошибки "column already exists" и подобные
          if (err.message.includes('already exists') || err.message.includes('Duplicate column')) {
            console.log('⚠ Пропущен (уже существует):', err.message.substring(0, 50));
          } else {
            throw err;
          }
        }
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
