// Server-side only - используем require для mysql2
import { Sequelize } from 'sequelize';

// Используем require для избежания проблем с webpack
let sequelizeInstance: Sequelize | null = null;

function getSequelize(): Sequelize {
  if (!sequelizeInstance) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // @ts-ignore
    const mysql2 = require('mysql2');
    
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

