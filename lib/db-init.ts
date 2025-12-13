// Динамическая инициализация БД только на сервере
import { Sequelize } from 'sequelize';

let sequelizeInstance: Sequelize | null = null;

export async function getSequelize(): Promise<Sequelize> {
  if (sequelizeInstance) {
    return sequelizeInstance;
  }

  // Динамический импорт mysql2 только на сервере
  const mysql2 = await import('mysql2');
  
  sequelizeInstance = new Sequelize(
    'optsetkh_main',
    'optsetkh_main',
    '100100Main',
    {
      host: 'optsetkh.beget.tech',
      dialect: 'mysql',
      dialectModule: mysql2.default,
      logging: false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    }
  );

  return sequelizeInstance;
}

