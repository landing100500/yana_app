import { Op, QueryTypes } from 'sequelize';
import sequelize from '@/lib/db';
import User from '@/models/User';
import NatalChart from '@/models/NatalChart';
import Session from '@/models/Session';
import MailList from '@/models/MailList';
import { getUserPlanSnapshot, parsePlanCode, type PlanCode } from '@/lib/subscription';
import {
  FREE_AI_REQUESTS_LIMIT,
  FREE_AI_REMAINING_SQL,
} from '@/lib/free-ai-requests-constants';
import { addUsersToList } from '@/lib/mail-list-users';
import { col, fn } from 'sequelize';

const EFFECTIVE_PLAN_SQL = `CASE
  WHEN users.planCode IS NULL OR users.planCode = 'free' THEN 'free'
  WHEN users.planExpiresAt IS NOT NULL AND users.planExpiresAt <= NOW() THEN 'free'
  ELSE users.planCode
END`;

export { FREE_AI_REMAINING_SQL };

export const ADMIN_USERS_DEFAULT_LIMIT = 50;
export const ADMIN_USERS_MAX_LIMIT = 100;

export type AdminUsersPlanStats = Record<PlanCode, number>;

export interface AdminUserFilters {
  email?: string;
  planCode?: string | null;
  /** Точное значение остатка бесплатных запросов (например 0). */
  freeAiRemaining?: number | null;
}

export interface AdminUserRow {
  id: number;
  email: string | null;
  phone: string | null;
  name: string;
  tariff: string;
  planCode: PlanCode;
  planExpiresAt: string | null;
  createdAt: Date;
  chartCount: number;
  lastVisitAt: string | null;
  freeAiRequestsUsed: number;
  freeAiRequestsLimit: number;
  remainingAiRequests: number;
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return ADMIN_USERS_DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), ADMIN_USERS_MAX_LIMIT);
}

function parseRemainingFilter(value: unknown): number | null {
  if (value === undefined || value === null || value === '' || value === 'all') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export function buildAdminUsersWhere(filters: AdminUserFilters) {
  const andConditions: unknown[] = [];

  const trimmedEmail = filters.email?.trim();
  if (trimmedEmail) {
    const like = `%${trimmedEmail}%`;
    andConditions.push({
      [Op.or]: [
        { email: { [Op.like]: like } },
        { phone: { [Op.like]: like } },
        { name: { [Op.like]: like } },
      ],
    });
  }

  const parsedPlan =
    filters.planCode && filters.planCode !== 'all' ? parsePlanCode(filters.planCode) : null;
  if (parsedPlan) {
    andConditions.push(sequelize.where(sequelize.literal(EFFECTIVE_PLAN_SQL), parsedPlan));
  }

  const remaining = parseRemainingFilter(filters.freeAiRemaining);
  if (remaining != null) {
    andConditions.push(
      sequelize.where(sequelize.literal(FREE_AI_REMAINING_SQL), remaining)
    );
  }

  if (andConditions.length === 0) return {};
  if (andConditions.length === 1) return andConditions[0] as Record<string, unknown>;
  return { [Op.and]: andConditions };
}

export async function getAdminUsersPlanStats(): Promise<AdminUsersPlanStats> {
  const rows = (await sequelize.query(
    `SELECT effective_plan AS planCode, COUNT(*) AS count
     FROM (
       SELECT CASE
         WHEN planCode IS NULL OR planCode = 'free' THEN 'free'
         WHEN planExpiresAt IS NOT NULL AND planExpiresAt <= NOW() THEN 'free'
         ELSE planCode
       END AS effective_plan
       FROM users
     ) AS plan_rows
     GROUP BY effective_plan`,
    { type: QueryTypes.SELECT }
  )) as Array<{ planCode: string; count: string | number }>;

  const stats: AdminUsersPlanStats = {
    free: 0,
    hours24: 0,
    optimalLight: 0,
    optimal: 0,
    professional: 0,
  };

  for (const row of rows) {
    const code = parsePlanCode(row.planCode) || 'free';
    const count = Number(row.count) || 0;
    if (code in stats) stats[code] += count;
    else stats.free += count;
  }

  return stats;
}

export async function resolveAdminUserIds(filters: AdminUserFilters): Promise<number[]> {
  const where = buildAdminUsersWhere(filters);
  const rows = await User.findAll({
    where,
    attributes: ['id'],
    order: [['id', 'ASC']],
  });
  return rows.map((u) => u.id);
}

export async function grantFreeAiRequestsToUsers(
  userIds: number[],
  add: number
): Promise<{ updated: number }> {
  const amount = Math.floor(Number(add));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('add must be a positive integer');
  }
  if (userIds.length === 0) return { updated: 0 };

  // Батчами — безопаснее на больших выборках
  const CHUNK = 500;
  let updated = 0;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const chunk = userIds.slice(i, i + CHUNK);
    const [, meta] = await sequelize.query(
      `UPDATE users
       SET freeAiRequestsLimit = COALESCE(freeAiRequestsLimit, :defLimit) + :amount
       WHERE id IN (:ids)`,
      {
        replacements: {
          defLimit: FREE_AI_REQUESTS_LIMIT,
          amount,
          ids: chunk,
        },
      }
    );
    const affected =
      typeof meta === 'object' && meta && 'affectedRows' in meta
        ? Number((meta as { affectedRows?: number }).affectedRows) || 0
        : chunk.length;
    updated += affected;
  }
  return { updated };
}

export async function grantFreeAiRequestsToUser(
  userId: number,
  add: number
): Promise<{
  updated: boolean;
  freeAiRequestsUsed: number;
  freeAiRequestsLimit: number;
  remainingAiRequests: number;
}> {
  const user = await User.findByPk(userId);
  if (!user) throw new Error('USER_NOT_FOUND');

  const amount = Math.floor(Number(add));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('INVALID_ADD');
  }

  const used = Number((user as any).freeAiRequestsUsed) || 0;
  const prevLimit =
    Number((user as any).freeAiRequestsLimit) || FREE_AI_REQUESTS_LIMIT;
  const nextLimit = prevLimit + amount;
  (user as any).freeAiRequestsLimit = nextLimit;
  await user.save();

  return {
    updated: true,
    freeAiRequestsUsed: used,
    freeAiRequestsLimit: nextLimit,
    remainingAiRequests: Math.max(0, nextLimit - used),
  };
}

export async function createMailListFromAdminFilters(params: {
  name: string;
  description?: string;
  filters: AdminUserFilters;
}): Promise<{ listId: number; matched: number; added: number }> {
  const name = params.name.trim();
  if (!name) throw new Error('EMPTY_NAME');

  const userIds = await resolveAdminUserIds(params.filters);
  const list = await MailList.create({
    name,
    description: params.description?.trim() || null,
  });
  const added = userIds.length > 0 ? await addUsersToList(list.id, userIds, 'import') : 0;
  return { listId: list.id, matched: userIds.length, added };
}

export async function fetchAdminUsersPage(params: {
  page?: number;
  limit?: number;
  email?: string;
  planCode?: string | null;
  freeAiRemaining?: number | string | null;
}): Promise<{
  users: AdminUserRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  planStats: AdminUsersPlanStats;
}> {
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const limit = clampLimit(Number(params.limit) || ADMIN_USERS_DEFAULT_LIMIT);
  const filters: AdminUserFilters = {
    email: params.email,
    planCode: params.planCode,
    freeAiRemaining: parseRemainingFilter(params.freeAiRemaining),
  };
  const where = buildAdminUsersWhere(filters);

  const { rows, count } = await User.findAndCountAll({
    where,
    attributes: [
      'id',
      'phone',
      'email',
      'name',
      'createdAt',
      'planCode',
      'planExpiresAt',
      'freeAiRequestsUsed',
      'freeAiRequestsLimit',
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });

  const userIds = rows.map((u) => u.id);
  const chartCountByUserId = new Map<number, number>();
  const lastVisitByUserId = new Map<number, string>();

  if (userIds.length > 0) {
    const chartCounts = (await NatalChart.findAll({
      attributes: ['userId', [fn('COUNT', col('id')), 'chartCount']],
      where: { userId: userIds },
      group: ['userId'],
      raw: true,
    })) as unknown as Array<{ userId: number; chartCount: string | number }>;

    const sessionRows = (await Session.findAll({
      attributes: ['userId', [fn('MAX', col('updatedAt')), 'lastVisitAt']],
      where: { userId: userIds },
      group: ['userId'],
      raw: true,
    })) as unknown as Array<{ userId: number; lastVisitAt: string | Date | null }>;

    for (const row of chartCounts) {
      chartCountByUserId.set(row.userId, Number(row.chartCount) || 0);
    }
    for (const row of sessionRows) {
      if (row.userId && row.lastVisitAt) {
        lastVisitByUserId.set(row.userId, new Date(row.lastVisitAt).toISOString());
      }
    }
  }

  const users: AdminUserRow[] = rows.map((user) => {
    const plan = getUserPlanSnapshot(user);
    const used = Number((user as any).freeAiRequestsUsed) || 0;
    const limitVal =
      Number((user as any).freeAiRequestsLimit) || FREE_AI_REQUESTS_LIMIT;
    return {
      id: user.id,
      email: user.email || null,
      phone: user.phone ?? null,
      name: user.name || user.email || user.phone || `User #${user.id}`,
      tariff: plan.title,
      planCode: plan.code,
      planExpiresAt: plan.expiresAt,
      createdAt: user.createdAt,
      chartCount: chartCountByUserId.get(user.id) || 0,
      lastVisitAt: lastVisitByUserId.get(user.id) || null,
      freeAiRequestsUsed: used,
      freeAiRequestsLimit: limitVal,
      remainingAiRequests: Math.max(0, limitVal - used),
    };
  });

  const total = count;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const planStats = await getAdminUsersPlanStats();

  return { users, page, limit, total, totalPages, planStats };
}
