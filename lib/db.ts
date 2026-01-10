/* eslint-disable */
// Server-side only - используем require для mysql2
import { Sequelize } from 'sequelize';

// Используем require для избежания проблем с webpack
let sequelizeInstance: Sequelize | null = null;

function getSequelize(): Sequelize {
  if (!sequelizeInstance) {
    // @ts-ignore - require needed for mysql2 to work with webpack
    const mysql2 = require('mysql2');
    
    const dbName = process.env.DB_NAME || 'optsetkh_main';
    const dbUser = process.env.DB_USER || 'optsetkh_main';
    const dbPassword = process.env.DB_PASSWORD || '100100Main';
    const dbHost = process.env.DB_HOST || 'optsetkh.beget.tech';
    
    // Логирование для отладки (не логируем пароль)
    if (process.env.NODE_ENV === 'production') {
      console.log('[DB] Connecting to database:', {
        host: dbHost,
        database: dbName,
        user: dbUser,
        hasPassword: !!dbPassword,
        usingEnvVars: {
          DB_NAME: !!process.env.DB_NAME,
          DB_USER: !!process.env.DB_USER,
          DB_PASSWORD: !!process.env.DB_PASSWORD,
          DB_HOST: !!process.env.DB_HOST,
        }
      });
    }
    
    sequelizeInstance = new Sequelize(
      dbName,
      dbUser,
      dbPassword,
      {
        host: dbHost,
        dialect: 'mysql',
        dialectModule: mysql2,
        logging: false,
        pool: {
          max: 5,
          min: 0,
          acquire: 30000,
          idle: 10000
        }
      }
    );
  }
  return sequelizeInstance;
}

export default getSequelize();

