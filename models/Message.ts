import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';
import ChatTopic from './ChatTopic';

interface MessageAttributes {
  id: number;
  topicId: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MessageCreationAttributes extends Optional<MessageAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

class Message extends Model<MessageAttributes, MessageCreationAttributes> implements MessageAttributes {
  public id!: number;
  public topicId!: number;
  public role!: 'user' | 'assistant';
  public content!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Message.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    topicId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: ChatTopic,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    role: {
      type: DataTypes.ENUM('user', 'assistant'),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
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
    tableName: 'messages',
    timestamps: true,
  }
);

Message.belongsTo(ChatTopic, { foreignKey: 'topicId' });
ChatTopic.hasMany(Message, { foreignKey: 'topicId', onDelete: 'CASCADE' });

export default Message;

