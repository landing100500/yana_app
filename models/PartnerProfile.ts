import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';
import User from './User';

export type PartnerVerificationStatus = 'none' | 'pending' | 'approved' | 'rejected';

interface PartnerProfileAttributes {
  id: number;
  userId: number;
  referralCode: string;
  balanceRub: string;
  verificationStatus: PartnerVerificationStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PartnerProfileCreationAttributes
  extends Optional<
    PartnerProfileAttributes,
    'id' | 'balanceRub' | 'verificationStatus' | 'createdAt' | 'updatedAt'
  > {}

class PartnerProfile
  extends Model<PartnerProfileAttributes, PartnerProfileCreationAttributes>
  implements PartnerProfileAttributes
{
  public id!: number;
  public userId!: number;
  public referralCode!: string;
  public balanceRub!: string;
  public verificationStatus!: PartnerVerificationStatus;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PartnerProfile.init(
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
    },
    referralCode: {
      type: DataTypes.STRING(32),
      allowNull: false,
      unique: true,
    },
    balanceRub: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: '0.00',
    },
    verificationStatus: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'none',
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
    tableName: 'partner_profiles',
    timestamps: true,
  }
);

PartnerProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasOne(PartnerProfile, { foreignKey: 'userId', as: 'partnerProfile' });

export default PartnerProfile;
