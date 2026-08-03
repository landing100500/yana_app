import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';
import User from './User';

interface PartnerReferralAttributes {
  id: number;
  partnerUserId: number;
  referredUserId: number;
  registeredAt: Date;
  firstPaidAt?: Date | null;
  windowExpiresAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PartnerReferralCreationAttributes
  extends Optional<
    PartnerReferralAttributes,
    'id' | 'firstPaidAt' | 'windowExpiresAt' | 'createdAt' | 'updatedAt'
  > {}

class PartnerReferral
  extends Model<PartnerReferralAttributes, PartnerReferralCreationAttributes>
  implements PartnerReferralAttributes
{
  public id!: number;
  public partnerUserId!: number;
  public referredUserId!: number;
  public registeredAt!: Date;
  public firstPaidAt?: Date | null;
  public windowExpiresAt?: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PartnerReferral.init(
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
    referredUserId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      unique: true,
      references: { model: User, key: 'id' },
    },
    registeredAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    firstPaidAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    windowExpiresAt: {
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
    tableName: 'partner_referrals',
    timestamps: true,
    indexes: [{ fields: ['partnerUserId'], name: 'partner_referrals_partner_user_id' }],
  }
);

PartnerReferral.belongsTo(User, { foreignKey: 'partnerUserId', as: 'partner' });
PartnerReferral.belongsTo(User, { foreignKey: 'referredUserId', as: 'referred' });

export default PartnerReferral;
