import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';
import ChatTopic from './ChatTopic';
import Message from './Message';

interface ChatTopicSummaryAttributes {
  id: number;
  topicId: number;
  summary: string;
  upToMessageId: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ChatTopicSummaryCreationAttributes extends Optional<ChatTopicSummaryAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

class ChatTopicSummary
  extends Model<ChatTopicSummaryAttributes, ChatTopicSummaryCreationAttributes>
  implements ChatTopicSummaryAttributes
{
  public id!: number;
  public topicId!: number;
  public summary!: string;
  public upToMessageId!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ChatTopicSummary.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    topicId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      unique: true,
      references: { model: ChatTopic, key: 'id' },
      onDelete: 'CASCADE',
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    upToMessageId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: Message, key: 'id' },
      onDelete: 'CASCADE',
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
    tableName: 'chat_topic_summaries',
    timestamps: true,
  }
);

ChatTopicSummary.belongsTo(ChatTopic, { foreignKey: 'topicId' });
ChatTopicSummary.belongsTo(Message, { foreignKey: 'upToMessageId' });

export default ChatTopicSummary;
