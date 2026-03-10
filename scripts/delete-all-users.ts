/**
 * Удаление всех пользователей и всех связанных с ними данных.
 * Порядок: логи чата → резюме топиков → сообщения → топики → память пользователя → анкеты → натальные карты → сессии → пользователи.
 */
import { initDatabase } from '@/lib/initDb';
import User from '@/models/User';
import Session from '@/models/Session';
import UserAnketa from '@/models/UserAnketa';
import NatalChart from '@/models/NatalChart';
import UserMemory from '@/models/UserMemory';
import ChatTopic from '@/models/ChatTopic';
import Message from '@/models/Message';
import ChatTopicSummary from '@/models/ChatTopicSummary';
import ChatRequestLog from '@/models/ChatRequestLog';

async function deleteAllUsers() {
  try {
    await initDatabase();

    const users = await User.findAll({ attributes: ['id'] });
    const userIds = users.map((u) => u.id);

    if (userIds.length === 0) {
      console.log('Пользователей нет.');
      process.exit(0);
      return;
    }

    console.log(`Найдено пользователей: ${userIds.length}. Удаление связанных данных...`);

    const topicIds = (await ChatTopic.findAll({ where: { userId: userIds }, attributes: ['id'] })).map((t) => t.id);

    let n = await ChatRequestLog.destroy({ where: { userId: userIds } });
    console.log(`  ChatRequestLog: ${n}`);

    if (topicIds.length > 0) {
      n = await ChatTopicSummary.destroy({ where: { topicId: topicIds } });
      console.log(`  ChatTopicSummary: ${n}`);
      n = await Message.destroy({ where: { topicId: topicIds } });
      console.log(`  Message: ${n}`);
      n = await ChatTopic.destroy({ where: { id: topicIds } });
      console.log(`  ChatTopic: ${n}`);
    }

    n = await UserMemory.destroy({ where: { userId: userIds } });
    console.log(`  UserMemory: ${n}`);
    n = await UserAnketa.destroy({ where: { userId: userIds } });
    console.log(`  UserAnketa: ${n}`);
    n = await NatalChart.destroy({ where: { userId: userIds } });
    console.log(`  NatalChart: ${n}`);
    n = await Session.destroy({ where: { userId: userIds } });
    console.log(`  Session: ${n}`);
    n = await User.destroy({ where: { id: userIds } });
    console.log(`  User: ${n}`);

    console.log('✅ Все пользователи и связанные данные удалены.');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Ошибка:', error.message);
    console.error(error);
    process.exit(1);
  }
}

deleteAllUsers();
