import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';

interface EmailSendLogAttributes {
  id: number;
  email: string;
  createdAt?: Date;
}

interface EmailSendLogCreationAttributes extends Optional<EmailSendLogAttributes, 'id' | 'createdAt'> {}

class EmailSendLog extends Model<EmailSendLogAttributes, EmailSendLogCreationAttributes> implements EmailSendLogAttributes {
  public id!: number;
  public email!: string;
  public readonly createdAt!: Date;
}

EmailSendLog.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(255),
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
    tableName: 'email_send_logs',
    timestamps: false,
    updatedAt: false,
    indexes: [{ fields: ['email', 'createdAt'] }],
  }
);

export default EmailSendLog;
