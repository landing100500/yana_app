import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';

export type MailEnrollmentStatus = 'active' | 'completed' | 'cancelled' | 'unsubscribed';

interface MailSequenceEnrollmentAttributes {
  id: number;
  sequenceId: number;
  userId: number;
  currentStepOrder: number;
  nextSendAt?: Date | null;
  status: MailEnrollmentStatus;
  enrolledAt: Date;
  completedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MailSequenceEnrollmentCreationAttributes
  extends Optional<
    MailSequenceEnrollmentAttributes,
    'id' | 'currentStepOrder' | 'nextSendAt' | 'status' | 'completedAt' | 'createdAt' | 'updatedAt'
  > {}

class MailSequenceEnrollment
  extends Model<MailSequenceEnrollmentAttributes, MailSequenceEnrollmentCreationAttributes>
  implements MailSequenceEnrollmentAttributes
{
  public id!: number;
  public sequenceId!: number;
  public userId!: number;
  public currentStepOrder!: number;
  public nextSendAt?: Date | null;
  public status!: MailEnrollmentStatus;
  public enrolledAt!: Date;
  public completedAt?: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MailSequenceEnrollment.init(
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
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    currentStepOrder: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    nextSendAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'active',
    },
    enrolledAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    completedAt: {
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
    tableName: 'mail_sequence_enrollments',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['sequenceId', 'userId'] },
      { fields: ['status', 'nextSendAt'] },
    ],
  }
);

export default MailSequenceEnrollment;
