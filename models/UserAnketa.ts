import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';
import User from './User';

interface UserAnketaAttributes {
  id: number;
  userId: number;
  gender: string | null;
  birthDate: string | null;
  birthCity: string | null;
  birthTime: string | null;
  name: string | null;
  motherJob: string | null;
  fatherJob: string | null;
  hasMoved: boolean | null;
  lifeDifficulties: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserAnketaCreationAttributes extends Optional<UserAnketaAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

class UserAnketa extends Model<UserAnketaAttributes, UserAnketaCreationAttributes> implements UserAnketaAttributes {
  public id!: number;
  public userId!: number;
  public gender!: string | null;
  public birthDate!: string | null;
  public birthCity!: string | null;
  public birthTime!: string | null;
  public name!: string | null;
  public motherJob!: string | null;
  public fatherJob!: string | null;
  public hasMoved!: boolean | null;
  public lifeDifficulties!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

UserAnketa.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      unique: true,
      references: {
        model: User,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    gender: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    birthDate: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    birthCity: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    birthTime: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    motherJob: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    fatherJob: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    hasMoved: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    lifeDifficulties: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    tableName: 'user_anketa',
    timestamps: true,
  }
);

UserAnketa.belongsTo(User, { foreignKey: 'userId' });
User.hasOne(UserAnketa, { foreignKey: 'userId', as: 'anketa' });

export default UserAnketa;
