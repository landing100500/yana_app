import { NextRequest, NextResponse } from 'next/server';
import { Op, fn, col, where as seqWhere, literal } from 'sequelize';
import { initDatabase } from '@/lib/initDb';
import { checkAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth';
import MailSend from '@/models/MailSend';
import MailCampaign from '@/models/MailCampaign';
import MailSequenceStep from '@/models/MailSequenceStep';
import MailSequence from '@/models/MailSequence';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

type Period = 'week' | 'month' | 'custom';
type SourceFilter = 'all' | 'campaign' | 'sequence';
type StatusFilter = 'all' | 'sent' | 'failed' | 'pending';

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildPeriodDates(period: Period, fromRaw: string | null, toRaw: string | null) {
  const now = new Date();
  const to = endOfDay(parseDate(toRaw) ?? now);

  if (period === 'custom') {
    const fromParsed = parseDate(fromRaw);
    const from = fromParsed ? startOfDay(fromParsed) : startOfDay(now);
    return { from, to };
  }

  if (period === 'month') {
    const from = startOfDay(new Date(to));
    from.setDate(from.getDate() - 29);
    return { from, to };
  }

  const from = startOfDay(new Date(to));
  from.setDate(from.getDate() - 6);
  return { from, to };
}

function formatDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function GET(request: NextRequest) {
  try {
    await initDatabase();
    if (!(await checkAdminAuth())) return adminUnauthorizedResponse();

    const searchParams = request.nextUrl.searchParams;
    const period = (searchParams.get('period') || 'week') as Period;
    if (!['week', 'month', 'custom'].includes(period)) {
      return NextResponse.json({ error: 'Неверный тип периода' }, { status: 400 });
    }

    const fromRaw = searchParams.get('from');
    const toRaw = searchParams.get('to');
    const { from, to } = buildPeriodDates(period, fromRaw, toRaw);

    const status = (searchParams.get('status') || 'all') as StatusFilter;
    const source = (searchParams.get('source') || 'all') as SourceFilter;
    const emailQuery = (searchParams.get('email') || '').trim().toLowerCase();
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') || 50)));
    const offset = (page - 1) * limit;

    const dateCol = fn('COALESCE', col('sentAt'), col('createdAt'));
    const andConditions: object[] = [seqWhere(dateCol, { [Op.between]: [from, to] })];

    if (status !== 'all') {
      andConditions.push({ status });
    }
    if (source === 'campaign') {
      andConditions.push({ campaignId: { [Op.ne]: null } });
    } else if (source === 'sequence') {
      andConditions.push({ sequenceStepId: { [Op.ne]: null } });
    }
    if (emailQuery) {
      andConditions.push({ email: { [Op.like]: `%${emailQuery}%` } });
    }

    const where = { [Op.and]: andConditions };

    const total = await MailSend.count({ where });

    const sends = await MailSend.findAll({
      where,
      order: [[literal('COALESCE(`sentAt`, `createdAt`)'), 'DESC']],
      limit,
      offset,
    });

    const campaignIds = Array.from(new Set(sends.map((s) => s.campaignId).filter(Boolean))) as number[];
    const stepIds = Array.from(new Set(sends.map((s) => s.sequenceStepId).filter(Boolean))) as number[];
    const userIds = Array.from(new Set(sends.map((s) => s.userId)));

    const campaigns =
      campaignIds.length > 0
        ? await MailCampaign.findAll({ where: { id: campaignIds }, attributes: ['id', 'name'] })
        : [];
    const steps =
      stepIds.length > 0
        ? await MailSequenceStep.findAll({
            where: { id: stepIds },
            attributes: ['id', 'sequenceId', 'stepOrder', 'subject'],
          })
        : [];
    const sequenceIds = Array.from(new Set(steps.map((s) => s.sequenceId)));
    const sequences =
      sequenceIds.length > 0
        ? await MailSequence.findAll({ where: { id: sequenceIds }, attributes: ['id', 'name'] })
        : [];
    const users =
      userIds.length > 0
        ? await User.findAll({ where: { id: userIds }, attributes: ['id', 'name', 'email'] })
        : [];

    const campaignMap = new Map(campaigns.map((c) => [c.id, c.name]));
    const stepMap = new Map(steps.map((s) => [s.id, s]));
    const sequenceMap = new Map(sequences.map((s) => [s.id, s.name]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    const summaryRows = (await MailSend.findAll({
      where,
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true,
    })) as unknown as Array<{ status: string; count: string }>;

    const summary = { total, sent: 0, failed: 0, pending: 0 };
    for (const row of summaryRows) {
      const n = Number(row.count) || 0;
      if (row.status === 'sent') summary.sent = n;
      else if (row.status === 'failed') summary.failed = n;
      else if (row.status === 'pending') summary.pending = n;
    }

    const sentWhere = { [Op.and]: [...andConditions, { status: 'sent' }] };
    const dailyRows = (await MailSend.findAll({
      where: sentWhere,
      attributes: [[fn('DATE', col('sentAt')), 'day'], [fn('COUNT', col('id')), 'count']],
      group: [fn('DATE', col('sentAt'))],
      order: [[fn('DATE', col('sentAt')), 'ASC']],
      raw: true,
    })) as unknown as Array<{ day: string; count: string }>;

    const byDay = dailyRows.map((r) => ({ date: r.day, count: Number(r.count) || 0 }));

    const rows = sends.map((send) => {
      const eventAt = send.sentAt || send.createdAt;
      const user = userMap.get(send.userId);
      let sourceType: 'campaign' | 'sequence' | 'unknown' = 'unknown';
      let sourceLabel = '—';

      if (send.campaignId) {
        sourceType = 'campaign';
        sourceLabel = campaignMap.get(send.campaignId) || `Рассылка #${send.campaignId}`;
      } else if (send.sequenceStepId) {
        sourceType = 'sequence';
        const step = stepMap.get(send.sequenceStepId);
        const seqName = step ? sequenceMap.get(step.sequenceId) : null;
        sourceLabel = seqName
          ? `${seqName} · письмо ${step?.stepOrder ?? '?'}`
          : `Цепочка · шаг #${send.sequenceStepId}`;
      }

      return {
        id: send.id,
        eventAt: eventAt.toISOString(),
        email: send.email,
        subject: send.subject,
        status: send.status,
        errorMessage: send.errorMessage,
        sourceType,
        sourceLabel,
        campaignId: send.campaignId,
        sequenceStepId: send.sequenceStepId,
        user: user
          ? { id: user.id, name: user.name || null, email: user.email || null }
          : { id: send.userId, name: null, email: send.email },
      };
    });

    return NextResponse.json({
      period,
      from: formatDateKey(from),
      to: formatDateKey(to),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      summary,
      byDay,
      rows,
    });
  } catch (error) {
    console.error('Mail history GET error:', error);
    return NextResponse.json({ error: 'Failed to load mail history' }, { status: 500 });
  }
}
