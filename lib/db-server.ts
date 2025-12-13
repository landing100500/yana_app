// Server-side only database connection
import { Sequelize } from 'sequelize';

// Используем require для mysql2, чтобы избежать проблем с webpack
const mysql2 = require('mysql2');

let sequelizeInstance: Sequelize | null = null;

export function getSequelize(): Sequelize {
  if (!sequelizeInstance) {
    sequelizeInstance = new Sequelize(
      'optsetkh_main',
      'optsetkh_main',
      '100100Main',
      {
        host: 'optsetkh.beget.tech',
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

