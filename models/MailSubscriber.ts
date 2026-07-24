import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';

interface MailSubscriberAttributes {
  id: number;
  userId: number;
  email: string;
  unsubscribeToken: string;
  isSubscribed: boolean;
  unsubscribedAt?: Date | null;
  /** Не слать маркетинг (hard bounce), отдельно от unsubscribe */
  suppressedAt?: Date | null;
  suppressReason?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MailSubscriberCreationAttributes
  extends Optional<
    MailSubscriberAttributes,
    | 'id'
    | 'isSubscribed'
    | 'unsubscribedAt'
    | 'suppressedAt'
    | 'suppressReason'
    | 'createdAt'
    | 'updatedAt'
  > {}

class MailSubscriber
  extends Model<MailSubscriberAttributes, MailSubscriberCreationAttributes>
  implements MailSubscriberAttributes
{
  public id!: number;
  public userId!: number;
  public email!: string;
  public unsubscribeToken!: string;
  public isSubscribed!: boolean;
  public unsubscribedAt?: Date | null;
  public suppressedAt?: Date | null;
  public suppressReason?: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MailSubscriber.init(
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
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    unsubscribeToken: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    isSubscribed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    unsubscribedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    suppressedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    suppressReason: {
      type: DataTypes.STRING(500),
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
    tableName: 'mail_subscribers',
    timestamps: true,
  }
);

export default MailSubscriber;
