import { Op, QueryTypes } from 'sequelize';
import sequelize from '@/lib/db';
import User from '@/models/User';
import NatalChart from '@/models/NatalChart';
import Session from '@/models/Session';
import { getUserPlanSnapshot, parsePlanCode, type PlanCode } from '@/lib/subscription';
import { col, fn } from 'sequelize';

const EFFECTIVE_PLAN_SQL = `CASE
  WHEN users.planCode IS NULL OR users.planCode = 'free' THEN 'free'
  WHEN users.planExpiresAt IS NOT NULL AND users.planExpiresAt <= NOW() THEN 'free'
  ELSE users.planCode
END`;

export const ADMIN_USERS_DEFAULT_LIMIT = 50;
export const ADMIN_USERS_MAX_LIMIT = 100;

export type AdminUsersPlanStats = Record<PlanCode, number>;

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
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return ADMIN_USERS_DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), ADMIN_USERS_MAX_LIMIT);
}

function buildWhere(email?: string, planCode?: string | null) {
  const andConditions: unknown[] = [];

  const trimmedEmail = email?.trim();
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

  const parsedPlan = planCode && planCode !== 'all' ? parsePlanCode(planCode) : null;
  if (parsedPlan) {
    andConditions.push(sequelize.where(sequelize.literal(EFFECTIVE_PLAN_SQL), parsedPlan));
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

export async function fetchAdminUsersPage(params: {
  page?: number;
  limit?: number;
  email?: string;
  planCode?: string | null;
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
  const where = buildWhere(params.email, params.planCode);

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
    };
  });

  const total = count;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const planStats = await getAdminUsersPlanStats();

  return { users, page, limit, total, totalPages, planStats };
}
