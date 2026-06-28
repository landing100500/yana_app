import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';

export type MailListMemberSource = 'manual' | 'campaign' | 'import';

interface MailListMemberAttributes {
  id: number;
  listId: number;
  userId: number;
  source: MailListMemberSource;
  sourceCampaignId?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MailListMemberCreationAttributes
  extends Optional<MailListMemberAttributes, 'id' | 'source' | 'sourceCampaignId' | 'createdAt' | 'updatedAt'> {}

class MailListMember
  extends Model<MailListMemberAttributes, MailListMemberCreationAttributes>
  implements MailListMemberAttributes
{
  public id!: number;
  public listId!: number;
  public userId!: number;
  public source!: MailListMemberSource;
  public sourceCampaignId?: number | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MailListMember.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    listId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    source: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'manual',
    },
    sourceCampaignId: {
      type: DataTypes.INTEGER.UNSIGNED,
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
    tableName: 'mail_list_members',
    timestamps: true,
    indexes: [{ unique: true, fields: ['listId', 'userId'] }],
  }
);

export default MailListMember;
