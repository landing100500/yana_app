import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';

interface EmailOtpAttributes {
  id: number;
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface EmailOtpCreationAttributes
  extends Optional<EmailOtpAttributes, 'id' | 'attempts' | 'createdAt' | 'updatedAt'> {}

class EmailOtp extends Model<EmailOtpAttributes, EmailOtpCreationAttributes> implements EmailOtpAttributes {
  public id!: number;
  public email!: string;
  public codeHash!: string;
  public expiresAt!: Date;
  public attempts!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

EmailOtp.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    codeHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    attempts: {
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
    tableName: 'email_otps',
    timestamps: true,
  }
);

export default EmailOtp;
