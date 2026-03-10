import sequelize from './db';
import User from '@/models/User';
import Session from '@/models/Session';
import ChatTopic from '@/models/ChatTopic';
import Message from '@/models/Message';
import UserAnketa from '@/models/UserAnketa';
import AdminNatalChart from '@/models/AdminNatalChart';
import ChatRequestLog from '@/models/ChatRequestLog';
import UserMemory from '@/models/UserMemory';
import ChatTopicSummary from '@/models/ChatTopicSummary';

export async function initDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    
    // Используем sync без alter, чтобы не создавать лишние индексы
    // Таблицы будут созданы только если их нет
    await sequelize.sync({ force: false });
    console.log('Database models synchronized.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
}

