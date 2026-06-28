import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';

export type MailCampaignAudienceType = 'all' | 'plan' | 'list' | 'previous_campaign';
export type MailCampaignStatus = 'draft' | 'queued' | 'sending' | 'sent' | 'failed';

interface MailCampaignAttributes {
  id: number;
  name: string;
  subject: string;
  htmlBody: string;
  audienceType: MailCampaignAudienceType;
  audiencePlanCode?: string | null;
  audienceListId?: number | null;
  previousCampaignId?: number | null;
  status: MailCampaignStatus;
  scheduledAt?: Date | null;
  sentAt?: Date | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MailCampaignCreationAttributes
  extends Optional<
    MailCampaignAttributes,
    | 'id'
    | 'audiencePlanCode'
    | 'audienceListId'
    | 'previousCampaignId'
    | 'status'
    | 'scheduledAt'
    | 'sentAt'
    | 'totalRecipients'
    | 'sentCount'
    | 'failedCount'
    | 'createdAt'
    | 'updatedAt'
  > {}

class MailCampaign extends Model<MailCampaignAttributes, MailCampaignCreationAttributes> implements MailCampaignAttributes {
  public id!: number;
  public name!: string;
  public subject!: string;
  public htmlBody!: string;
  public audienceType!: MailCampaignAudienceType;
  public audiencePlanCode?: string | null;
  public audienceListId?: number | null;
  public previousCampaignId?: number | null;
  public status!: MailCampaignStatus;
  public scheduledAt?: Date | null;
  public sentAt?: Date | null;
  public totalRecipients!: number;
  public sentCount!: number;
  public failedCount!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MailCampaign.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    subject: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    htmlBody: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
    },
    audienceType: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'all',
    },
    audiencePlanCode: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    audienceListId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    previousCampaignId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'draft',
    },
    scheduledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    totalRecipients: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    sentCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    failedCount: {
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
    tableName: 'mail_campaigns',
    timestamps: true,
  }
);

export default MailCampaign;
