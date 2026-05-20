import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';

interface UserAttributes {
  id: number;
  phone?: string | null;
  email?: string | null;
  password?: string | null;
  name?: string;
  planCode?: string;
  planAssignedAt?: Date | null;
  planExpiresAt?: Date | null;
  freeWindowStartedAt?: Date | null;
  freeMinutesUsed?: number;
  reminderLastSentAt?: Date | null;
  reminderDayIndex?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: number;
  public phone?: string | null;
  public email?: string | null;
  public password?: string | null;
  public name?: string;
  public planCode?: string;
  public planAssignedAt?: Date | null;
  public planExpiresAt?: Date | null;
  public freeWindowStartedAt?: Date | null;
  public freeMinutesUsed?: number;
  public reminderLastSentAt?: Date | null;
  public reminderDayIndex?: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    planCode: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'free',
    },
    planAssignedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    planExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    freeWindowStartedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    freeMinutesUsed: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    reminderLastSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    reminderDayIndex: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
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
    tableName: 'users',
    timestamps: true,
  }
);

export default User;

