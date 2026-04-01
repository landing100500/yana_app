import { readFileSync } from 'fs';
import { join } from 'path';
import sequelize from '@/lib/db';

async function runMigration() {
  try {
    console.log('Загрузка SQL миграции create-phone-otp-sms-logs...');
    const sqlPath = join(process.cwd(), 'migrations', 'create-phone-otp-sms-logs.sql');
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

    console.log('✅ Миграция phone_otps / sms_send_logs успешно выполнена!');
    process.exit(0);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('❌ Ошибка при выполнении миграции:', err.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
