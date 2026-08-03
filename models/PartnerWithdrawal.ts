import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';
import User from './User';

export type PartnerWithdrawalMethod = 'card' | 'sbp';
export type PartnerWithdrawalStatus = 'pending' | 'approved' | 'paid' | 'rejected';

interface PartnerWithdrawalAttributes {
  id: number;
  partnerUserId: number;
  amountRub: string;
  ndflPercent: string;
  ndflAmount: string;
  payoutAmount: string;
  method: PartnerWithdrawalMethod;
  requisites: string;
  status: PartnerWithdrawalStatus;
  adminNote?: string | null;
  processedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PartnerWithdrawalCreationAttributes
  extends Optional<
    PartnerWithdrawalAttributes,
    'id' | 'status' | 'adminNote' | 'processedAt' | 'createdAt' | 'updatedAt'
  > {}

class PartnerWithdrawal
  extends Model<PartnerWithdrawalAttributes, PartnerWithdrawalCreationAttributes>
  implements PartnerWithdrawalAttributes
{
  public id!: number;
  public partnerUserId!: number;
  public amountRub!: string;
  public ndflPercent!: string;
  public ndflAmount!: string;
  public payoutAmount!: string;
  public method!: PartnerWithdrawalMethod;
  public requisites!: string;
  public status!: PartnerWithdrawalStatus;
  public adminNote?: string | null;
  public processedAt?: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PartnerWithdrawal.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    partnerUserId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: User, key: 'id' },
    },
    amountRub: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },
    ndflPercent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },
    ndflAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },
    payoutAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },
    method: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    requisites: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'pending',
    },
    adminNote: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    processedAt: {
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
    tableName: 'partner_withdrawals',
    timestamps: true,
    indexes: [{ fields: ['partnerUserId'], name: 'partner_withdrawals_partner_user_id' }],
  }
);

PartnerWithdrawal.belongsTo(User, { foreignKey: 'partnerUserId', as: 'partner' });

export default PartnerWithdrawal;
