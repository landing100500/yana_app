import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';
import User from './User';

export type PartnerLedgerType = 'commission' | 'withdrawal' | 'plan_purchase' | 'adjustment';

interface PartnerLedgerAttributes {
  id: number;
  partnerUserId: number;
  type: PartnerLedgerType;
  amountRub: string;
  balanceAfter: string;
  paymentId?: number | null;
  withdrawalId?: number | null;
  meta?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PartnerLedgerCreationAttributes
  extends Optional<
    PartnerLedgerAttributes,
    'id' | 'paymentId' | 'withdrawalId' | 'meta' | 'createdAt' | 'updatedAt'
  > {}

class PartnerLedger
  extends Model<PartnerLedgerAttributes, PartnerLedgerCreationAttributes>
  implements PartnerLedgerAttributes
{
  public id!: number;
  public partnerUserId!: number;
  public type!: PartnerLedgerType;
  public amountRub!: string;
  public balanceAfter!: string;
  public paymentId?: number | null;
  public withdrawalId?: number | null;
  public meta?: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PartnerLedger.init(
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
    type: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    amountRub: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },
    balanceAfter: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },
    paymentId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    withdrawalId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    meta: {
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
    tableName: 'partner_ledgers',
    timestamps: true,
    indexes: [
      { fields: ['partnerUserId'], name: 'partner_ledgers_partner_user_id' },
      { fields: ['paymentId'], name: 'partner_ledgers_payment_id' },
    ],
  }
);

PartnerLedger.belongsTo(User, { foreignKey: 'partnerUserId', as: 'partner' });

export default PartnerLedger;
