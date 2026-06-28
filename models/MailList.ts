import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';

interface MailListAttributes {
  id: number;
  name: string;
  description?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MailListCreationAttributes extends Optional<MailListAttributes, 'id' | 'description' | 'createdAt' | 'updatedAt'> {}

class MailList extends Model<MailListAttributes, MailListCreationAttributes> implements MailListAttributes {
  public id!: number;
  public name!: string;
  public description?: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MailList.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
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
    tableName: 'mail_lists',
    timestamps: true,
  }
);

export default MailList;
