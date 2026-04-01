import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';

interface SmsSendLogAttributes {
  id: number;
  phone: string;
  createdAt?: Date;
}

interface SmsSendLogCreationAttributes extends Optional<SmsSendLogAttributes, 'id' | 'createdAt'> {}

class SmsSendLog extends Model<SmsSendLogAttributes, SmsSendLogCreationAttributes> implements SmsSendLogAttributes {
  public id!: number;
  public phone!: string;
  public readonly createdAt!: Date;
}

SmsSendLog.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'sms_send_logs',
    timestamps: false,
    updatedAt: false,
    indexes: [{ fields: ['phone', 'createdAt'] }],
  }
);

export default SmsSendLog;
