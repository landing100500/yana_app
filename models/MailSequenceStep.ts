import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';

interface MailSequenceStepAttributes {
  id: number;
  sequenceId: number;
  stepOrder: number;
  delayDays: number;
  delayHours: number;
  subject: string;
  htmlBody: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MailSequenceStepCreationAttributes
  extends Optional<MailSequenceStepAttributes, 'id' | 'delayDays' | 'delayHours' | 'createdAt' | 'updatedAt'> {}

class MailSequenceStep
  extends Model<MailSequenceStepAttributes, MailSequenceStepCreationAttributes>
  implements MailSequenceStepAttributes
{
  public id!: number;
  public sequenceId!: number;
  public stepOrder!: number;
  public delayDays!: number;
  public delayHours!: number;
  public subject!: string;
  public htmlBody!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MailSequenceStep.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    sequenceId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    stepOrder: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    delayDays: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    delayHours: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    subject: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    htmlBody: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
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
    tableName: 'mail_sequence_steps',
    timestamps: true,
    indexes: [{ unique: true, fields: ['sequenceId', 'stepOrder'] }],
  }
);

export default MailSequenceStep;
