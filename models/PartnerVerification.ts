import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';
import User from './User';

export type PartnerDocVerificationStatus = 'pending' | 'approved' | 'rejected';

interface PartnerVerificationAttributes {
  id: number;
  partnerUserId: number;
  passportScanPath: string;
  innScanPath: string;
  innNumber?: string | null;
  status: PartnerDocVerificationStatus;
  adminNote?: string | null;
  reviewedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PartnerVerificationCreationAttributes
  extends Optional<
    PartnerVerificationAttributes,
    'id' | 'innNumber' | 'status' | 'adminNote' | 'reviewedAt' | 'createdAt' | 'updatedAt'
  > {}

class PartnerVerification
  extends Model<PartnerVerificationAttributes, PartnerVerificationCreationAttributes>
  implements PartnerVerificationAttributes
{
  public id!: number;
  public partnerUserId!: number;
  public passportScanPath!: string;
  public innScanPath!: string;
  public innNumber?: string | null;
  public status!: PartnerDocVerificationStatus;
  public adminNote?: string | null;
  public reviewedAt?: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PartnerVerification.init(
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
    passportScanPath: {
      type: DataTypes.STRING(512),
      allowNull: false,
    },
    innScanPath: {
      type: DataTypes.STRING(512),
      allowNull: false,
    },
    innNumber: {
      type: DataTypes.STRING(32),
      allowNull: true,
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
    reviewedAt: {
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
    tableName: 'partner_verifications',
    timestamps: true,
    indexes: [{ fields: ['partnerUserId'], name: 'partner_verifications_partner_user_id' }],
  }
);

PartnerVerification.belongsTo(User, { foreignKey: 'partnerUserId', as: 'partner' });

export default PartnerVerification;
