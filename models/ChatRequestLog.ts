import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';
import User from './User';
import ChatTopic from './ChatTopic';
import Message from './Message';

export interface SectionRef {
  id: string;
  name: string;
}

interface ChatRequestLogAttributes {
  id: number;
  userId: number;
  topicId: number;
  userMessageId: number;
  assistantMessageId: number;
  sectionRefs: SectionRef[];
  createdAt?: Date;
}

interface ChatRequestLogCreationAttributes
  extends Optional<ChatRequestLogAttributes, 'id' | 'createdAt'> {}

class ChatRequestLog
  extends Model<ChatRequestLogAttributes, ChatRequestLogCreationAttributes>
  implements ChatRequestLogAttributes
{
  public id!: number;
  public userId!: number;
  public topicId!: number;
  public userMessageId!: number;
  public assistantMessageId!: number;
  public sectionRefs!: SectionRef[];
  public readonly createdAt!: Date;
}

ChatRequestLog.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: User, key: 'id' },
    },
    topicId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: ChatTopic, key: 'id' },
      onDelete: 'CASCADE',
    },
    userMessageId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: Message, key: 'id' },
      onDelete: 'CASCADE',
    },
    assistantMessageId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: Message, key: 'id' },
      onDelete: 'CASCADE',
    },
    sectionRefs: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: () => [],
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'chat_request_logs',
    timestamps: true,
    updatedAt: false,
  }
);

ChatRequestLog.belongsTo(User, { foreignKey: 'userId' });
ChatRequestLog.belongsTo(ChatTopic, { foreignKey: 'topicId' });
ChatRequestLog.belongsTo(Message, { foreignKey: 'userMessageId', as: 'userMessage' });
ChatRequestLog.belongsTo(Message, { foreignKey: 'assistantMessageId', as: 'assistantMessage' });

export default ChatRequestLog;
