import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';
import User from './User';

interface ChatTopicAttributes {
  id: number;
  userId: number;
  title: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ChatTopicCreationAttributes extends Optional<ChatTopicAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

class ChatTopic extends Model<ChatTopicAttributes, ChatTopicCreationAttributes> implements ChatTopicAttributes {
  public id!: number;
  public userId!: number;
  public title!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ChatTopic.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    title: {
      type: DataTypes.STRING(255),
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
    tableName: 'chat_topics',
    timestamps: true,
  }
);

ChatTopic.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(ChatTopic, { foreignKey: 'userId' });

export default ChatTopic;

