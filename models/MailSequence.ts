import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';

export type MailSequenceTriggerType = 'new_user' | 'manual' | 'none';

interface MailSequenceAttributes {
  id: number;
  name: string;
  description?: string | null;
  triggerType: MailSequenceTriggerType;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MailSequenceCreationAttributes
  extends Optional<MailSequenceAttributes, 'id' | 'description' | 'triggerType' | 'isActive' | 'createdAt' | 'updatedAt'> {}

class MailSequence extends Model<MailSequenceAttributes, MailSequenceCreationAttributes> implements MailSequenceAttributes {
  public id!: number;
  public name!: string;
  public description?: string | null;
  public triggerType!: MailSequenceTriggerType;
  public isActive!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MailSequence.init(
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
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    triggerType: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'none',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
    tableName: 'mail_sequences',
    timestamps: true,
  }
);

export default MailSequence;
