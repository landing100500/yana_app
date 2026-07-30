import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';
import User from '@/models/User';

interface TrialEndLetterSendAttributes {
  id: number;
  userId: number;
  email: string | null;
  bodyText: string;
  lagnaSign: number;
  lagneshaHouse: number;
  lagneshaPlanet: string;
  gender: string;
  chatSent: boolean;
  emailSent: boolean;
  emailError: string | null;
  topicId: number | null;
  sentAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

type TrialEndLetterSendCreation = Optional<
  TrialEndLetterSendAttributes,
  'id' | 'email' | 'emailError' | 'topicId' | 'chatSent' | 'emailSent' | 'createdAt' | 'updatedAt'
>;

class TrialEndLetterSend
  extends Model<TrialEndLetterSendAttributes, TrialEndLetterSendCreation>
  implements TrialEndLetterSendAttributes
{
  public id!: number;
  public userId!: number;
  public email!: string | null;
  public bodyText!: string;
  public lagnaSign!: number;
  public lagneshaHouse!: number;
  public lagneshaPlanet!: string;
  public gender!: string;
  public chatSent!: boolean;
  public emailSent!: boolean;
  public emailError!: string | null;
  public topicId!: number | null;
  public sentAt!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

TrialEndLetterSend.init(
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
      allowNull: true,
    },
    bodyText: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
    },
    lagnaSign: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
    },
    lagneshaHouse: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
    },
    lagneshaPlanet: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    gender: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    chatSent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    emailSent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    emailError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    topicId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'trial_end_letter_sends',
    timestamps: true,
  }
);

TrialEndLetterSend.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasOne(TrialEndLetterSend, { foreignKey: 'userId', as: 'trialEndLetterSend' });

export default TrialEndLetterSend;
