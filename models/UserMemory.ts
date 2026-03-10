import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';
import User from './User';

interface UserMemoryAttributes {
  id: number;
  userId: number;
  facts: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserMemoryCreationAttributes extends Optional<UserMemoryAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

class UserMemory extends Model<UserMemoryAttributes, UserMemoryCreationAttributes> implements UserMemoryAttributes {
  public id!: number;
  public userId!: number;
  public facts!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

UserMemory.init(
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
      references: { model: User, key: 'id' },
      onDelete: 'CASCADE',
    },
    facts: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
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
    tableName: 'user_memories',
    timestamps: true,
  }
);

UserMemory.belongsTo(User, { foreignKey: 'userId' });

export default UserMemory;
