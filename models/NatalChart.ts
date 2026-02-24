import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';
import User from './User';

interface NatalChartAttributes {
  id: number;
  userId: number;
  // Название карты (месяц, год, время)
  name: string;
  // Данные для расчета (могут быть из анкеты или текущее время)
  chartDate: string; // Дата для расчета карты
  chartTime: string; // Время для расчета карты
  chartCity: string; // Город для расчета
  chartLatitude: number;
  chartLongitude: number;
  timezone: number;
  julianDay: number;
  
  // Планеты (долгота в градусах)
  sun: number;
  moon: number;
  mercury: number;
  venus: number;
  mars: number;
  jupiter: number;
  saturn: number;
  uranus: number;
  neptune: number;
  pluto: number;
  
  // Узлы Луны
  northNode: number;
  southNode: number;
  
  // Асцендент и MC
  ascendant: number;
  midheaven: number;
  
  // Дома (куспиды домов 1-12)
  house1: number;
  house2: number;
  house3: number;
  house4: number;
  house5: number;
  house6: number;
  house7: number;
  house8: number;
  house9: number;
  house10: number;
  house11: number;
  house12: number;
  
  // Дополнительные данные
  houseSystem: string; // 'P' для Placidus
  siderealTime: number;
  
  // Основная натальная карта (по данным анкеты, создаётся при первом заходе в чат)
  isMain: boolean;
  // true — карта создана в админке; false — при входе пользователя в сервис
  createdByAdmin: boolean;
  // Метаданные
  calculatedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface NatalChartCreationAttributes extends Optional<NatalChartAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

class NatalChart extends Model<NatalChartAttributes, NatalChartCreationAttributes> implements NatalChartAttributes {
  public id!: number;
  public userId!: number;
  public name!: string;
  public chartDate!: string;
  public chartTime!: string;
  public chartCity!: string;
  public chartLatitude!: number;
  public chartLongitude!: number;
  public timezone!: number;
  public julianDay!: number;
  public sun!: number;
  public moon!: number;
  public mercury!: number;
  public venus!: number;
  public mars!: number;
  public jupiter!: number;
  public saturn!: number;
  public uranus!: number;
  public neptune!: number;
  public pluto!: number;
  public northNode!: number;
  public southNode!: number;
  public ascendant!: number;
  public midheaven!: number;
  public house1!: number;
  public house2!: number;
  public house3!: number;
  public house4!: number;
  public house5!: number;
  public house6!: number;
  public house7!: number;
  public house8!: number;
  public house9!: number;
  public house10!: number;
  public house11!: number;
  public house12!: number;
  public houseSystem!: string;
  public siderealTime!: number;
  public isMain!: boolean;
  public createdByAdmin!: boolean;
  public calculatedAt!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

NatalChart.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    chartDate: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    chartTime: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    chartCity: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    chartLatitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: false,
    },
    chartLongitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: false,
    },
    timezone: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },
    julianDay: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false,
    },
    sun: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    moon: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    mercury: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    venus: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    mars: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    jupiter: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    saturn: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    uranus: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    neptune: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    pluto: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    northNode: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    southNode: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    ascendant: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    midheaven: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    house1: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    house2: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    house3: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    house4: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    house5: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    house6: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    house7: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    house8: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    house9: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    house10: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    house11: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    house12: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    houseSystem: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'P',
    },
    isMain: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    createdByAdmin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    siderealTime: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: false,
    },
    calculatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'natal_charts',
    timestamps: true,
  }
);

NatalChart.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(NatalChart, { foreignKey: 'userId', as: 'natalCharts' });

export default NatalChart;
