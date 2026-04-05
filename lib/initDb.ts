import sequelize from './db';
import { DataTypes } from 'sequelize';
import User from '@/models/User';
import Session from '@/models/Session';
import ChatTopic from '@/models/ChatTopic';
import Message from '@/models/Message';
import UserAnketa from '@/models/UserAnketa';
import AdminNatalChart from '@/models/AdminNatalChart';
import ChatRequestLog from '@/models/ChatRequestLog';
import UserMemory from '@/models/UserMemory';
import ChatTopicSummary from '@/models/ChatTopicSummary';
import PhoneOtp from '@/models/PhoneOtp';
import SmsSendLog from '@/models/SmsSendLog';
import EmailOtp from '@/models/EmailOtp';
import EmailSendLog from '@/models/EmailSendLog';
import '@/models/AppSetting';

async function ensureAuthSchema() {
  const queryInterface = sequelize.getQueryInterface();

  try {
    const usersTable = await queryInterface.describeTable('users');

    if (!usersTable.email) {
      await queryInterface.addColumn('users', 'email', {
        type: DataTypes.STRING(255),
        allowNull: true,
      });
    }

    if (usersTable.phone && usersTable.phone.allowNull === false) {
      await queryInterface.changeColumn('users', 'phone', {
        type: DataTypes.STRING(20),
        allowNull: true,
      });
    }
  } catch (error) {
    console.error('Failed to ensure auth schema:', error);
    throw error;
  }
}

export async function initDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    await ensureAuthSchema();
    
    // Используем sync без alter, чтобы не создавать лишние индексы
    // Таблицы будут созданы только если их нет
    await sequelize.sync({ force: false });
    console.log('Database models synchronized.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
}

