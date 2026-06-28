import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';

export type MailSendStatus = 'pending' | 'sent' | 'failed';

interface MailSendAttributes {
  id: number;
  userId: number;
  email: string;
  campaignId?: number | null;
  sequenceStepId?: number | null;
  enrollmentId?: number | null;
  subject: string;
  status: MailSendStatus;
  errorMessage?: string | null;
  sentAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MailSendCreationAttributes
  extends Optional<
    MailSendAttributes,
    'id' | 'campaignId' | 'sequenceStepId' | 'enrollmentId' | 'status' | 'errorMessage' | 'sentAt' | 'createdAt' | 'updatedAt'
  > {}

class MailSend extends Model<MailSendAttributes, MailSendCreationAttributes> implements MailSendAttributes {
  public id!: number;
  public userId!: number;
  public email!: string;
  public campaignId?: number | null;
  public sequenceStepId?: number | null;
  public enrollmentId?: number | null;
  public subject!: string;
  public status!: MailSendStatus;
  public errorMessage?: string | null;
  public sentAt?: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MailSend.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    campaignId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    sequenceStepId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    enrollmentId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    subject: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'pending',
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    sentAt: {
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
    tableName: 'mail_sends',
    timestamps: true,
    indexes: [
      { fields: ['status'] },
      { fields: ['campaignId'] },
      { fields: ['enrollmentId'] },
      { fields: ['sentAt'] },
      { fields: ['email'] },
    ],
  }
);

export default MailSend;
