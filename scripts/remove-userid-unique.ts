import sequelize from '@/lib/db';

async function removeUniqueConstraint() {
  try {
    console.log('Проверка и удаление unique constraint на userId...');
    
    // Проверяем существование unique индекса на userId
    const [results] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.statistics 
      WHERE table_schema = DATABASE() 
      AND table_name = 'natal_charts' 
      AND column_name = 'userId'
      AND non_unique = 0
    `);
    
    const count = (results as any[])[0]?.count || 0;
    
    if (count > 0) {
      console.log('Удаление unique индекса на userId...');
      
      // Пробуем удалить индекс напрямую
      try {
        await sequelize.query(`DROP INDEX userId ON natal_charts`);
        console.log('✓ Unique индекс userId удален');
      } catch (e: any) {
        console.log('Попытка удалить через ALTER TABLE...');
        try {
          await sequelize.query(`ALTER TABLE natal_charts DROP INDEX userId`);
          console.log('✓ Unique индекс userId удален через ALTER TABLE');
        } catch (e2: any) {
          console.log('Ошибка:', e2.message);
          // Пробуем найти точное имя индекса
          const [indexResults] = await sequelize.query(`
            SELECT INDEX_NAME 
            FROM information_schema.statistics 
            WHERE table_schema = DATABASE() 
            AND table_name = 'natal_charts' 
            AND column_name = 'userId'
            AND non_unique = 0
          `);
          
          if ((indexResults as any[]).length > 0) {
            const indexName = (indexResults as any[])[0].INDEX_NAME;
            console.log(`Удаление индекса ${indexName}...`);
            await sequelize.query(`ALTER TABLE natal_charts DROP INDEX ${indexName}`);
            console.log(`✓ Индекс ${indexName} удален`);
          }
        }
      }
    } else {
      console.log('✓ Unique индекс на userId не найден (уже удален)');
    }
    
    // Убеждаемся, что есть обычный индекс на userId
    const [indexCheck] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.statistics 
      WHERE table_schema = DATABASE() 
      AND table_name = 'natal_charts' 
      AND column_name = 'userId'
      AND non_unique = 1
    `);
    
    if ((indexCheck as any[])[0]?.count === 0) {
      console.log('Добавление обычного (не unique) индекса на userId...');
      await sequelize.query(`CREATE INDEX idx_userId ON natal_charts(userId)`);
      console.log('✓ Индекс idx_userId создан');
    } else {
      console.log('✓ Обычный индекс на userId уже существует');
    }
    
    console.log('✅ Исправление завершено!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Ошибка:', error.message);
    console.error(error);
    process.exit(1);
  }
}

removeUniqueConstraint();
