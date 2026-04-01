import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';

interface PhoneOtpAttributes {
  id: number;
  phone: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PhoneOtpCreationAttributes
  extends Optional<PhoneOtpAttributes, 'id' | 'attempts' | 'createdAt' | 'updatedAt'> {}

class PhoneOtp extends Model<PhoneOtpAttributes, PhoneOtpCreationAttributes> implements PhoneOtpAttributes {
  public id!: number;
  public phone!: string;
  public codeHash!: string;
  public expiresAt!: Date;
  public attempts!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PhoneOtp.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    phone: {
      type: DataTypes.STRING(20),
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
    tableName: 'phone_otps',
    timestamps: true,
  }
);

export default PhoneOtp;
