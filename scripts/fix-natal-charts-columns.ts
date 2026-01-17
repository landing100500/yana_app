import sequelize from '@/lib/db';

async function fixColumns() {
  try {
    console.log('Проверка и добавление недостающих колонок...');
    
    // Проверяем существование колонки name
    const [results] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.columns 
      WHERE table_schema = DATABASE() 
      AND table_name = 'natal_charts' 
      AND column_name = 'name'
    `);
    
    const count = (results as any[])[0]?.count || 0;
    
    if (count === 0) {
      console.log('Добавление колонки name...');
      await sequelize.query(`
        ALTER TABLE natal_charts 
        ADD COLUMN name VARCHAR(255) NOT NULL DEFAULT 'Карта'
      `);
      console.log('✓ Колонка name добавлена');
    } else {
      console.log('✓ Колонка name уже существует');
    }
    
    // Проверяем и переименовываем колонки если нужно
    const [birthDateCheck] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.columns 
      WHERE table_schema = DATABASE() 
      AND table_name = 'natal_charts' 
      AND column_name = 'birthDate'
    `);
    
    if ((birthDateCheck as any[])[0]?.count > 0) {
      console.log('Переименование колонок...');
      try {
        await sequelize.query(`
          ALTER TABLE natal_charts 
          CHANGE COLUMN birthDate chartDate VARCHAR(50) NOT NULL
        `);
        console.log('✓ birthDate -> chartDate');
      } catch (e: any) {
        if (!e.message.includes('Duplicate column')) {
          console.log('⚠ Ошибка при переименовании birthDate:', e.message);
        }
      }
      
      try {
        await sequelize.query(`
          ALTER TABLE natal_charts 
          CHANGE COLUMN birthTime chartTime VARCHAR(50) NOT NULL
        `);
        console.log('✓ birthTime -> chartTime');
      } catch (e: any) {
        if (!e.message.includes('Duplicate column')) {
          console.log('⚠ Ошибка при переименовании birthTime:', e.message);
        }
      }
      
      try {
        await sequelize.query(`
          ALTER TABLE natal_charts 
          CHANGE COLUMN birthCity chartCity VARCHAR(255) NOT NULL
        `);
        console.log('✓ birthCity -> chartCity');
      } catch (e: any) {
        if (!e.message.includes('Duplicate column')) {
          console.log('⚠ Ошибка при переименовании birthCity:', e.message);
        }
      }
      
      try {
        await sequelize.query(`
          ALTER TABLE natal_charts 
          CHANGE COLUMN birthLatitude chartLatitude DECIMAL(10, 7) NOT NULL
        `);
        console.log('✓ birthLatitude -> chartLatitude');
      } catch (e: any) {
        if (!e.message.includes('Duplicate column')) {
          console.log('⚠ Ошибка при переименовании birthLatitude:', e.message);
        }
      }
      
      try {
        await sequelize.query(`
          ALTER TABLE natal_charts 
          CHANGE COLUMN birthLongitude chartLongitude DECIMAL(10, 7) NOT NULL
        `);
        console.log('✓ birthLongitude -> chartLongitude');
      } catch (e: any) {
        if (!e.message.includes('Duplicate column')) {
          console.log('⚠ Ошибка при переименовании birthLongitude:', e.message);
        }
      }
    } else {
      console.log('✓ Колонки уже переименованы');
    }
    
    console.log('✅ Исправление завершено!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Ошибка:', error.message);
    console.error(error);
    process.exit(1);
  }
}

fixColumns();
