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
import Payment from '@/models/Payment';
import '@/models/AppSetting';
import '@/models/MailSubscriber';
import '@/models/MailList';
import '@/models/MailListMember';
import '@/models/MailCampaign';
import '@/models/MailSend';
import '@/models/MailSequence';
import '@/models/MailSequenceStep';
import '@/models/MailSequenceEnrollment';

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

    if (!usersTable.planCode) {
      await queryInterface.addColumn('users', 'planCode', {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'free',
      });
    }
    if (!usersTable.planAssignedAt) {
      await queryInterface.addColumn('users', 'planAssignedAt', {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }
    if (!usersTable.planExpiresAt) {
      await queryInterface.addColumn('users', 'planExpiresAt', {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }
    if (!usersTable.planManuallyAssignedAt) {
      await queryInterface.addColumn('users', 'planManuallyAssignedAt', {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }
    if (!usersTable.freeWindowStartedAt) {
      await queryInterface.addColumn('users', 'freeWindowStartedAt', {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }
    if (!usersTable.freeMinutesUsed) {
      await queryInterface.addColumn('users', 'freeMinutesUsed', {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!usersTable.freeAiRequestsUsed) {
      await queryInterface.addColumn('users', 'freeAiRequestsUsed', {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!usersTable.planDailySecondsUsed) {
      await queryInterface.addColumn('users', 'planDailySecondsUsed', {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!usersTable.planDailyWindowDate) {
      await queryInterface.addColumn('users', 'planDailyWindowDate', {
        type: DataTypes.STRING(10),
        allowNull: true,
      });
    }
    if (!usersTable.planDailyLastTickAt) {
      await queryInterface.addColumn('users', 'planDailyLastTickAt', {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }
    if (!usersTable.reminderLastSentAt) {
      await queryInterface.addColumn('users', 'reminderLastSentAt', {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }
    if (!usersTable.reminderDayIndex) {
      await queryInterface.addColumn('users', 'reminderDayIndex', {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      });
    }
  } catch (error) {
    console.error('Failed to ensure auth schema:', error);
    throw error;
  }
}

async function ensureMailSchema() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    const sequencesTable = await queryInterface.describeTable('mail_sequences');

    if (!sequencesTable.launchedAt) {
      await queryInterface.addColumn('mail_sequences', 'launchedAt', {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }
    if (!sequencesTable.launchListId) {
      await queryInterface.addColumn('mail_sequences', 'launchListId', {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      });
    }

    const campaignsTable = await queryInterface.describeTable('mail_campaigns');
    if (!campaignsTable.scheduledAt) {
      await queryInterface.addColumn('mail_campaigns', 'scheduledAt', {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }

    try {
      const mailSendIndexes = (await queryInterface.showIndex('mail_sends')) as Array<{ name?: string }>;
      const uniqueName = 'mail_sends_campaign_user_unique';
      if (!mailSendIndexes.some((idx) => idx.name === uniqueName)) {
        await queryInterface.addIndex('mail_sends', ['campaignId', 'userId'], {
          unique: true,
          name: uniqueName,
        });
      }
    } catch (indexError) {
      console.warn('[DB] mail_sends unique index skipped (duplicates may exist):', indexError);
    }
  } catch (error: unknown) {
    const message = String(error instanceof Error ? error.message : error).toLowerCase();
    if (message.includes('does not exist') || message.includes('unknown table') || message.includes('no such table')) {
      return;
    }
    console.error('Failed to ensure mail schema:', error);
    throw error;
  }
}

async function ensurePaymentsSchema() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    const paymentsTable = await queryInterface.describeTable('payments');

    if (!paymentsTable.planCode) {
      await queryInterface.addColumn('payments', 'planCode', {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'free',
      });
    }
    if (!paymentsTable.amountValue) {
      await queryInterface.addColumn('payments', 'amountValue', {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: '0.00',
      });
    }
    if (!paymentsTable.currency) {
      await queryInterface.addColumn('payments', 'currency', {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'RUB',
      });
    }
    if (!paymentsTable.status) {
      await queryInterface.addColumn('payments', 'status', {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'pending',
      });
    }
    if (!paymentsTable.idempotenceKey) {
      await queryInterface.addColumn('payments', 'idempotenceKey', {
        type: DataTypes.STRING(64),
        allowNull: true,
      });
    }
    if (!paymentsTable.yookassaPaymentId) {
      await queryInterface.addColumn('payments', 'yookassaPaymentId', {
        type: DataTypes.STRING(64),
        allowNull: true,
      });
    }
    if (!paymentsTable.paidAt) {
      await queryInterface.addColumn('payments', 'paidAt', {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }
  } catch (error: any) {
    const message = String(error?.message || '').toLowerCase();
    // Таблица может отсутствовать до sync() — это нормальный кейс.
    if (message.includes('does not exist') || message.includes('unknown table') || message.includes('no such table')) {
      return;
    }
    console.error('Failed to ensure payments schema:', error);
    throw error;
  }
}

let initPromise: Promise<void> | null = null;
let dbReady = false;

/**
 * Один раз на процесс: authenticate + миграции схемы + sync.
 * Повторные вызовы (каждый API-запрос) не должны гонять sync параллельно —
 * это приводило к RangeError: Maximum call stack size exceeded в Sequelize на VPS.
 */
export async function initDatabase(): Promise<void> {
  if (dbReady) return;

  if (!initPromise) {
    initPromise = (async () => {
      await sequelize.authenticate();
      console.log('Database connection established successfully.');

      await ensureAuthSchema();
      await ensurePaymentsSchema();

      // sync без alter — только создание отсутствующих таблиц
      await sequelize.sync({ force: false });
      await ensureMailSchema();
      console.log('Database models synchronized.');

      dbReady = true;
    })().catch((error) => {
      initPromise = null;
      console.error('Unable to connect to the database:', error);
      throw error;
    });
  }

  await initPromise;
}

