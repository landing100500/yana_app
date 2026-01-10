/**
 * Скрипт для создания записей в таблице user_anketa для существующих пользователей
 * Запуск: npm run create-anketa
 * или: npx tsx scripts/create-anketa-for-existing-users.ts
 */

import sequelize from '../lib/db';
import User from '../models/User';
import UserAnketa from '../models/UserAnketa';
import { initDatabase } from '../lib/initDb';

async function createAnketaForExistingUsers() {
  try {
    console.log('Подключение к базе данных...');
    await initDatabase();

    console.log('Поиск пользователей без анкеты...');
    
    // Получаем всех пользователей
    const allUsers = await User.findAll();
    
    // Проверяем, у кого нет анкеты
    const usersWithoutAnketa = [];
    for (const user of allUsers) {
      const existingAnketa = await UserAnketa.findOne({
        where: { userId: user.id },
      });
      if (!existingAnketa) {
        usersWithoutAnketa.push(user);
      }
    }

    console.log(`Найдено пользователей без анкеты: ${usersWithoutAnketa.length}`);

    if (usersWithoutAnketa.length === 0) {
      console.log('Все пользователи уже имеют анкету.');
      await sequelize.close();
      return;
    }

    let created = 0;
    let errors = 0;

    for (const user of usersWithoutAnketa) {
      try {
        await UserAnketa.create({
          userId: user.id,
          gender: null,
          birthDate: null,
          birthCity: null,
          birthTime: null,
          name: null,
          motherJob: null,
          fatherJob: null,
          hasMoved: null,
          lifeDifficulties: null,
        });
        created++;
        console.log(`✓ Создана анкета для пользователя ID: ${user.id} (${user.phone})`);
      } catch (error: any) {
        errors++;
        console.error(`✗ Ошибка при создании анкеты для пользователя ID: ${user.id}`, error.message);
      }
    }

    console.log('\n=== Результаты ===');
    console.log(`Успешно создано: ${created}`);
    console.log(`Ошибок: ${errors}`);
    console.log(`Всего обработано: ${usersWithoutAnketa.length}`);

    await sequelize.close();
    console.log('\nГотово!');
  } catch (error: any) {
    console.error('Критическая ошибка:', error);
    await sequelize.close();
    process.exit(1);
  }
}

// Запуск скрипта
createAnketaForExistingUsers();
