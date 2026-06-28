import { Op } from 'sequelize';
import User from '@/models/User';
import MailListMember from '@/models/MailListMember';
import { getUserPlanSnapshot } from '@/lib/subscription';

export interface MailUserSearchParams {
  emailPrefix?: string;
  planCode?: string;
  registeredFrom?: string;
  registeredTo?: string;
  excludeListId?: number;
  limit?: number;
  offset?: number;
}

export interface BulkAddToListCriteria {
  userIds?: number[];
  fromListId?: number;
  planCode?: string;
  registeredFrom?: string;
  registeredTo?: string;
  emailPrefix?: string;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function baseUserWhere(emailPrefix?: string, registeredFrom?: string, registeredTo?: string) {
  const where: Record<string, unknown> = {
    email: { [Op.ne]: null },
    password: { [Op.ne]: null },
  };

  if (emailPrefix?.trim()) {
    where.email = { [Op.like]: `${emailPrefix.trim()}%` };
  }

  const from = parseDate(registeredFrom);
  const to = parseDate(registeredTo);
  if (from || to) {
    where.createdAt = {
      ...(from ? { [Op.gte]: startOfDay(from) } : {}),
      ...(to ? { [Op.lte]: endOfDay(to) } : {}),
    };
  }

  return where;
}

export async function searchMailUsers(params: MailUserSearchParams) {
  const limit = Math.min(100, Math.max(1, params.limit ?? 50));
  const offset = Math.max(0, params.offset ?? 0);

  let excludeIds: number[] = [];
  if (params.excludeListId) {
    const members = await MailListMember.findAll({
      where: { listId: params.excludeListId },
      attributes: ['userId'],
    });
    excludeIds = members.map((m) => m.userId);
  }

  const where = baseUserWhere(params.emailPrefix, params.registeredFrom, params.registeredTo);
  if (excludeIds.length > 0) {
    where.id = { [Op.notIn]: excludeIds };
  }

  let users = await User.findAll({
    where,
    attributes: ['id', 'email', 'name', 'planCode', 'createdAt'],
    order: [['email', 'ASC']],
    ...(params.planCode ? {} : { limit, offset }),
  });

  if (params.planCode) {
    const filtered = [];
    for (const user of users) {
      const snapshot = await getUserPlanSnapshot(user);
      if (snapshot.code === params.planCode) filtered.push(user);
    }
    users = filtered.slice(offset, offset + limit);
  }

  let total: number;
  if (params.planCode) {
    const allForPlan = await User.findAll({
      where,
      attributes: ['id', 'planCode'],
    });
    let planCount = 0;
    for (const user of allForPlan) {
      const snapshot = await getUserPlanSnapshot(user);
      if (snapshot.code === params.planCode) planCount++;
    }
    total = planCount;
  } else {
    total = await User.count({ where });
  }

  return {
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      planCode: u.planCode,
      createdAt: u.createdAt,
    })),
    total,
    limit,
    offset,
  };
}

export async function resolveUserIdsFromBulkCriteria(criteria: BulkAddToListCriteria): Promise<number[]> {
  const ids = new Set<number>();

  if (criteria.userIds?.length) {
    for (const id of criteria.userIds) ids.add(Number(id));
  }

  if (criteria.fromListId) {
    const members = await MailListMember.findAll({
      where: { listId: criteria.fromListId },
      attributes: ['userId'],
    });
    for (const m of members) ids.add(m.userId);
  }

  const hasFilters =
    criteria.planCode || criteria.emailPrefix || criteria.registeredFrom || criteria.registeredTo;

  if (hasFilters) {
    const where = baseUserWhere(criteria.emailPrefix, criteria.registeredFrom, criteria.registeredTo);
    const users = await User.findAll({
      where,
      attributes: ['id', 'planCode'],
    });

    for (const user of users) {
      if (criteria.planCode) {
        const snapshot = await getUserPlanSnapshot(user);
        if (snapshot.code !== criteria.planCode) continue;
      }
      ids.add(user.id);
    }
  }

  return Array.from(ids);
}

export async function addUsersToList(listId: number, userIds: number[], source: 'manual' | 'import' = 'manual') {
  let added = 0;
  for (const userId of userIds) {
    const [, created] = await MailListMember.findOrCreate({
      where: { listId, userId },
      defaults: { listId, userId, source },
    });
    if (created) added++;
  }
  return added;
}
