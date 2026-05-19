import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';
import User from './User';

export type PaymentStatus = 'pending' | 'succeeded' | 'canceled';

interface PaymentAttributes {
  id: number;
  userId: number;
  planCode: string;
  yookassaPaymentId?: string | null;
  amountValue: string;
  currency: string;
  status: PaymentStatus;
  idempotenceKey: string;
  paidAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PaymentCreationAttributes
  extends Optional<
    PaymentAttributes,
    'id' | 'yookassaPaymentId' | 'paidAt' | 'createdAt' | 'updatedAt'
  > {}

class Payment extends Model<PaymentAttributes, PaymentCreationAttributes> implements PaymentAttributes {
  public id!: number;
  public userId!: number;
  public planCode!: string;
  public yookassaPaymentId?: string | null;
  public amountValue!: string;
  public currency!: string;
  public status!: PaymentStatus;
  public idempotenceKey!: string;
  public paidAt?: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Payment.init(
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
    },
    planCode: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    yookassaPaymentId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      unique: true,
    },
    amountValue: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'RUB',
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'pending',
    },
    idempotenceKey: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    paidAt: {
      type: DataTypes.DATE,
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
    tableName: 'payments',
    timestamps: true,
  }
);

Payment.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(Payment, { foreignKey: 'userId' });

export default Payment;
