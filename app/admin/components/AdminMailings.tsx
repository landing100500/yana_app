'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DatePicker from '@/components/ui/DatePicker';
import EmailEditor from './EmailEditor';
import AdminPagination from './AdminPagination';
import styles from './AdminMailings.module.css';
import { PLAN_CONFIGS, type PlanCode } from '@/lib/subscription';

type Tab = 'campaigns' | 'sequences' | 'lists' | 'footer' | 'history';
type HistoryPeriod = 'week' | 'month' | 'custom';

interface MailCampaign {
  id: number;
  name: string;
  subject: string;
  htmlBody: string;
  audienceType: string;
  audiencePlanCode?: string | null;
  audienceListId?: number | null;
  previousCampaignId?: number | null;
  status: string;
  scheduledAt?: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
}

interface SearchUser {
  id: number;
  email: string | null;
  name: string | null;
  planCode?: string;
  createdAt?: string;
}

interface MailList {
  id: number;
  name: string;
  description?: string | null;
  memberCount?: number;
}

interface SequenceStep {
  delayDays: number;
  delayHours: number;
  subject: string;
  htmlBody: string;
}

interface SequenceStats {
  enrollments: {
    total: number;
    active: number;
    completed: number;
    unsubscribed: number;
    cancelled: number;
  };
  sends: { sent: number; pending: number; failed: number; sentToday?: number };
  steps: Array<{
    stepOrder: number;
    subject: string;
    sent: number;
    pending: number;
    failed: number;
  }>;
}

interface MailSequence {
  id: number;
  name: string;
  description?: string | null;
  triggerType: string;
  triggerPlanCode?: string | null;
  triggerPlanCodes?: string | null;
  excludePlanCodes?: string | null;
  excludeAllPaidPlans?: boolean;
  excludeListId?: number | null;
  excludeListName?: string | null;
  isActive: boolean;
  launchedAt?: string | null;
  launchListId?: number | null;
  launchListName?: string | null;
  steps?: SequenceStep[];
  stats?: SequenceStats;
}

interface SpamIssue {
  text: string;
  reason: string;
  suggestion: string;
}

interface MailHistoryRow {
  id: number;
  eventAt: string;
  email: string;
  subject: string;
  status: string;
  errorMessage?: string | null;
  sourceType: string;
  sourceLabel: string;
  user: { id: number; name: string | null; email: string | null };
}

interface MailHistoryResponse {
  period: HistoryPeriod;
  from: string;
  to: string;
  page: number;
  totalPages: number;
  total: number;
  summary: { total: number; sent: number; failed: number; pending: number };
  byDay: Array<{ date: string; count: number }>;
  rows: MailHistoryRow[];
}

function toInputDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toDatetimeLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

function defaultScheduleDatetime() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return toDatetimeLocal(d);
}

const PLAN_OPTIONS = Object.values(PLAN_CONFIGS).map((p) => ({ code: p.code, title: p.title }));
const PAID_PLAN_OPTIONS = PLAN_OPTIONS.filter((p) => p.code !== 'free');

function parseSequencePlanCodes(seq: {
  triggerPlanCodes?: string | null;
  triggerPlanCode?: string | null;
}): PlanCode[] {
  if (seq.triggerPlanCodes) {
    try {
      const parsed = JSON.parse(seq.triggerPlanCodes);
      if (Array.isArray(parsed)) {
        return parsed.filter((c): c is PlanCode =>
          typeof c === 'string' && PAID_PLAN_OPTIONS.some((p) => p.code === c)
        );
      }
    } catch {
      /* ignore */
    }
  }
  if (seq.triggerPlanCode && seq.triggerPlanCode !== 'free') {
    return [seq.triggerPlanCode as PlanCode];
  }
  return [];
}

function parseSequenceExcludePlanCodes(seq: { excludePlanCodes?: string | null }): PlanCode[] {
  if (!seq.excludePlanCodes) return [];
  try {
    const parsed = JSON.parse(seq.excludePlanCodes);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is PlanCode =>
      typeof c === 'string' && PAID_PLAN_OPTIONS.some((p) => p.code === c)
    );
  } catch {
    return [];
  }
}

function togglePlanCode(codes: PlanCode[], code: PlanCode): PlanCode[] {
  return codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code];
}

const emptyStep = (): SequenceStep => ({
  delayDays: 1,
  delayHours: 0,
  subject: '',
  htmlBody: '<p></p>',
});

export default function AdminMailings() {
  const [tab, setTab] = useState<Tab>('campaigns');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<MailCampaign[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<Array<Pick<MailCampaign, 'id' | 'name' | 'sentCount' | 'status'>>>([]);
  const [campaignsPage, setCampaignsPage] = useState(1);
  const [campaignsTotalPages, setCampaignsTotalPages] = useState(1);
  const [campaignsTotal, setCampaignsTotal] = useState(0);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [lists, setLists] = useState<MailList[]>([]);
  const [listOptions, setListOptions] = useState<MailList[]>([]);
  const [listsPage, setListsPage] = useState(1);
  const [listsTotalPages, setListsTotalPages] = useState(1);
  const [listsTotal, setListsTotal] = useState(0);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsLoaded, setListsLoaded] = useState(false);
  const [sequences, setSequences] = useState<MailSequence[]>([]);
  const [sequencesPage, setSequencesPage] = useState(1);
  const [sequencesTotalPages, setSequencesTotalPages] = useState(1);
  const [sequencesTotal, setSequencesTotal] = useState(0);
  const [sequencesLoading, setSequencesLoading] = useState(false);
  const [sequencesLoaded, setSequencesLoaded] = useState(false);
  const [footerHtml, setFooterHtml] = useState('');

  const [editingCampaign, setEditingCampaign] = useState<Partial<MailCampaign> | null>(null);
  const [editingSequence, setEditingSequence] = useState<{
    id?: number;
    name: string;
    description: string;
    triggerType: string;
    triggerPlanCodes: PlanCode[];
    excludePlanCodes: PlanCode[];
    excludeAllPaidPlans: boolean;
    excludeListId: number | null;
    steps: SequenceStep[];
  } | null>(null);

  const [newListName, setNewListName] = useState('');
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [listMembers, setListMembers] = useState<Array<{ userId: number; user?: { email?: string; name?: string } }>>([]);
  const [listMembersPage, setListMembersPage] = useState(1);
  const [listMembersTotalPages, setListMembersTotalPages] = useState(1);
  const [listMembersTotal, setListMembersTotal] = useState(0);
  const [listMembersLoading, setListMembersLoading] = useState(false);
  const [sequenceLaunchLists, setSequenceLaunchLists] = useState<Record<number, number>>({});
  const [expandedSequenceId, setExpandedSequenceId] = useState<number | null>(null);

  const [listAddMode, setListAddMode] = useState<'search' | 'list' | 'plan' | 'dates'>('search');
  const [userSearchEmail, setUserSearchEmail] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<SearchUser[]>([]);
  const [userSearchOffset, setUserSearchOffset] = useState(0);
  const [userSearchTotal, setUserSearchTotal] = useState(0);
  const USER_SEARCH_LIMIT = 50;
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [bulkFromListId, setBulkFromListId] = useState<number | ''>('');
  const [bulkPlanCode, setBulkPlanCode] = useState<PlanCode>('free');
  const [bulkRegFrom, setBulkRegFrom] = useState('');
  const [bulkRegTo, setBulkRegTo] = useState('');
  const [listAddLoading, setListAddLoading] = useState(false);

  const [campaignSendMode, setCampaignSendMode] = useState<'now' | 'schedule'>('now');
  const [campaignScheduledAt, setCampaignScheduledAt] = useState(defaultScheduleDatetime);

  const [spamResult, setSpamResult] = useState<{
    score: number;
    summary: string;
    issues: SpamIssue[];
    rewrittenHtml?: string;
  } | null>(null);
  const [spamChecking, setSpamChecking] = useState(false);

  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('week');
  const [historyFrom, setHistoryFrom] = useState(() => toInputDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)));
  const [historyTo, setHistoryTo] = useState(() => toInputDate(new Date()));
  const [historyStatus, setHistoryStatus] = useState<'all' | 'sent' | 'failed' | 'pending'>('all');
  const [historySource, setHistorySource] = useState<'all' | 'campaign' | 'sequence'>('all');
  const [historyEmail, setHistoryEmail] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<MailHistoryResponse | null>(null);

  const showMsg = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 4000);
  };

  const loadCampaignOptions = useCallback(async () => {
    const res = await fetch('/api/admin/mail/campaigns?forSelect=1');
    const data = await res.json();
    if (res.ok) setCampaignOptions(data.campaigns || []);
  }, []);

  const loadCampaigns = useCallback(async (page = campaignsPage) => {
    setCampaignsLoading(true);
    try {
      const res = await fetch(`/api/admin/mail/campaigns?page=${page}&limit=30`);
      const data = await res.json();
      if (res.ok) {
        setCampaigns(data.campaigns || []);
        setCampaignsPage(data.page || page);
        setCampaignsTotalPages(data.totalPages || 1);
        setCampaignsTotal(data.total || 0);
      }
    } finally {
      setCampaignsLoading(false);
      setCampaignsLoaded(true);
    }
  }, [campaignsPage]);

  const loadListOptions = useCallback(async () => {
    const res = await fetch('/api/admin/mail/lists?forSelect=1');
    const data = await res.json();
    if (res.ok) setListOptions(data.lists || []);
  }, []);

  const loadLists = useCallback(async (page = listsPage) => {
    setListsLoading(true);
    try {
      const res = await fetch(`/api/admin/mail/lists?page=${page}&limit=30`);
      const data = await res.json();
      if (res.ok) {
        setLists(data.lists || []);
        setListsPage(data.page || page);
        setListsTotalPages(data.totalPages || 1);
        setListsTotal(data.total || 0);
      } else {
        setError(data.error || 'Не удалось загрузить списки');
      }
    } finally {
      setListsLoading(false);
      setListsLoaded(true);
    }
  }, [listsPage]);

  const loadSequences = useCallback(async (page = sequencesPage) => {
    setSequencesLoading(true);
    try {
      const res = await fetch(`/api/admin/mail/sequences?page=${page}&limit=20`);
      const data = await res.json();
      if (res.ok) {
        setSequences(data.sequences || []);
        setSequencesPage(data.page || page);
        setSequencesTotalPages(data.totalPages || 1);
        setSequencesTotal(data.total || 0);
      }
    } finally {
      setSequencesLoading(false);
      setSequencesLoaded(true);
    }
  }, [sequencesPage]);

  const loadFooter = useCallback(async () => {
    const res = await fetch('/api/admin/mail/footer');
    const data = await res.json();
    if (res.ok) setFooterHtml(data.html || '');
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadCampaignOptions(), loadListOptions(), loadFooter()]);
    } catch {
      setError('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, [loadCampaignOptions, loadListOptions, loadFooter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (tab === 'campaigns' || tab === 'sequences' || tab === 'lists') {
      loadListOptions();
      loadCampaignOptions();
    }
  }, [tab, loadListOptions, loadCampaignOptions]);

  useEffect(() => {
    if (tab === 'campaigns') loadCampaigns(campaignsPage);
  }, [tab, campaignsPage, loadCampaigns]);

  useEffect(() => {
    if (tab === 'sequences') loadSequences(sequencesPage);
  }, [tab, sequencesPage, loadSequences]);

  useEffect(() => {
    if (tab === 'lists') loadLists(listsPage);
  }, [tab, listsPage, loadLists]);

  const loadListMembers = async (listId: number, page = 1) => {
    setListMembersLoading(true);
    try {
      const res = await fetch(`/api/admin/mail/lists/${listId}/members?page=${page}&limit=50`);
      const data = await res.json();
      if (res.ok) {
        setListMembers(data.members || []);
        setSelectedListId(listId);
        setListMembersPage(data.page || page);
        setListMembersTotalPages(data.totalPages || 1);
        setListMembersTotal(data.total || 0);
      }
    } finally {
      setListMembersLoading(false);
    }
  };

  const selectList = (listId: number) => {
    setListMembersPage(1);
    void loadListMembers(listId, 1);
  };

  const startNewCampaign = async () => {
    await loadListOptions();
    setEditingCampaign({
      name: '',
      subject: '',
      htmlBody: '<p>Здравствуйте!</p>',
      audienceType: 'all',
      audiencePlanCode: 'free',
      audienceListId: null,
    });
    setCampaignSendMode('now');
    setCampaignScheduledAt(defaultScheduleDatetime());
    setSpamResult(null);
  };

  const validateScheduleDatetime = (value: string): string | null => {
    if (!value) return 'Укажите дату и время отправки';
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) return 'Некорректная дата';
    if (at.getTime() <= Date.now()) return 'Время отправки не может быть в прошлом';
    return null;
  };

  const saveCampaignDraft = async (): Promise<MailCampaign | null> => {
    if (!editingCampaign?.name || !editingCampaign.subject || !editingCampaign.htmlBody) {
      setError('Заполните название, тему и текст');
      return null;
    }
    if (editingCampaign.audienceType === 'list' && !editingCampaign.audienceListId) {
      setError('Выберите список получателей');
      return null;
    }
    if (editingCampaign.audienceType === 'previous_campaign' && !editingCampaign.previousCampaignId) {
      setError('Выберите предыдущую рассылку');
      return null;
    }
    const isNew = !editingCampaign.id;
    const url = isNew ? '/api/admin/mail/campaigns' : `/api/admin/mail/campaigns/${editingCampaign.id}`;
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingCampaign),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Ошибка сохранения');
      return null;
    }
    return data.campaign as MailCampaign;
  };

  const saveCampaign = async () => {
    setLoading(true);
    setError(null);
    try {
      const saved = await saveCampaignDraft();
      if (!saved) return;
      setEditingCampaign(null);
      await loadCampaigns(campaignsPage);
      showMsg('Рассылка сохранена');
    } finally {
      setLoading(false);
    }
  };

  const launchCampaign = async (schedule: boolean) => {
    if (schedule) {
      const err = validateScheduleDatetime(campaignScheduledAt);
      if (err) {
        setError(err);
        return;
      }
    } else if (!confirm('Запустить рассылку сейчас? Письма пойдут через очередь.')) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const saved = await saveCampaignDraft();
      if (!saved?.id) return;

      const body = schedule ? { scheduledAt: new Date(campaignScheduledAt).toISOString() } : {};
      const res = await fetch(`/api/admin/mail/campaigns/${saved.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Ошибка запуска');
        return;
      }
      setEditingCampaign(null);
      await loadCampaigns(campaignsPage);
      if (schedule) {
        showMsg(`Отправка запланирована на ${new Date(campaignScheduledAt).toLocaleString('ru-RU')}`);
      } else {
        showMsg(`В очередь добавлено: ${data.queued} писем`);
      }
    } finally {
      setLoading(false);
    }
  };

  const sendCampaign = async (id: number) => {
    if (!confirm('Запустить рассылку? Письма будут отправлены через очередь.')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/mail/campaigns/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Ошибка запуска');
        return;
      }
      showMsg(`В очередь добавлено: ${data.queued} писем`);
      await loadCampaigns(campaignsPage);
    } finally {
      setLoading(false);
    }
  };

  const cancelCampaignSchedule = async (id: number) => {
    if (!confirm('Отменить запланированную отправку?')) return;
    const res = await fetch(`/api/admin/mail/campaigns/${id}/cancel-schedule`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showMsg('Отправка отменена, рассылка в черновике');
      await loadCampaigns(campaignsPage);
    } else {
      setError(data.error || 'Ошибка');
    }
  };

  const deleteCampaign = async (c: MailCampaign) => {
    const sent = c.status === 'sent';
    const msg = sent
      ? `Удалить рассылку «${c.name}»?\n\nБудут удалены все записи отправки (${c.sentCount} писем) из истории. Это действие нельзя отменить.`
      : `Удалить рассылку «${c.name}»? Все связанные данные будут удалены.`;
    if (!confirm(msg)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/mail/campaigns/${c.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Не удалось удалить');
        return;
      }
      if (editingCampaign?.id === c.id) setEditingCampaign(null);
      showMsg(
        data.deletedSends > 0
          ? `Рассылка удалена (очищено записей: ${data.deletedSends})`
          : 'Рассылка удалена'
      );
      await loadCampaigns(campaignsPage);
    } finally {
      setLoading(false);
    }
  };

  const searchUsersForList = async (append = false) => {
    if (!selectedListId) return;
    setListAddLoading(true);
    try {
      const offset = append ? userSearchOffset + USER_SEARCH_LIMIT : 0;
      const params = new URLSearchParams({
        excludeListId: String(selectedListId),
        limit: String(USER_SEARCH_LIMIT),
        offset: String(offset),
      });
      if (userSearchEmail.trim()) params.set('email', userSearchEmail.trim());
      const res = await fetch(`/api/admin/mail/users-search?${params}`);
      const data = await res.json();
      if (res.ok) {
        const users = data.users || [];
        setUserSearchResults(append ? (prev) => [...prev, ...users] : users);
        setUserSearchOffset(offset);
        setUserSearchTotal(data.total || 0);
        if (!append) setSelectedUserIds(new Set());
      } else {
        setError(data.error || 'Ошибка поиска');
      }
    } finally {
      setListAddLoading(false);
    }
  };

  const toggleUserSelection = (userId: number) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const bulkAddToList = async (payload: Record<string, unknown>) => {
    if (!selectedListId) return;
    setListAddLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/mail/lists/${selectedListId}/members/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Не удалось добавить');
        return;
      }
      showMsg(`Добавлено: ${data.added} из ${data.matched}`);
      await loadListMembers(selectedListId, listMembersPage);
      await loadLists(listsPage);
      await loadListOptions();
      setSelectedUserIds(new Set());
    } finally {
      setListAddLoading(false);
    }
  };

  const addSelectedUsersToList = async () => {
    if (selectedUserIds.size === 0) {
      setError('Выберите пользователей');
      return;
    }
    await bulkAddToList({ userIds: Array.from(selectedUserIds) });
  };

  const addCampaignToList = async (campaignId: number, listId: number) => {
    const res = await fetch(`/api/admin/mail/campaigns/${campaignId}/add-to-list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId }),
    });
    const data = await res.json();
    if (res.ok) {
      showMsg(`В список добавлено: ${data.added}`);
      await loadLists(listsPage);
      await loadListOptions();
    } else {
      setError(data.error || 'Ошибка');
    }
  };

  const runSpamCheck = async (subject: string, htmlBody: string) => {
    setSpamChecking(true);
    setSpamResult(null);
    try {
      const res = await fetch('/api/admin/mail/spam-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, htmlBody }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Ошибка проверки');
        return;
      }
      setSpamResult(data);
    } finally {
      setSpamChecking(false);
    }
  };

  const createList = async () => {
    if (!newListName.trim()) return;
    const res = await fetch('/api/admin/mail/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newListName.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      setNewListName('');
      await loadLists(listsPage);
      await loadListOptions();
      showMsg('Список создан');
    } else {
      setError(data.error);
    }
  };

  const saveFooter = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/mail/footer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: footerHtml }),
      });
      if (res.ok) showMsg('Футер сохранён');
      else setError('Не удалось сохранить футер');
    } finally {
      setLoading(false);
    }
  };

  const startNewSequence = () => {
    setEditingSequence({
      name: '',
      description: '',
      triggerType: 'manual',
      triggerPlanCodes: ['hours24'],
      excludePlanCodes: [],
      excludeAllPaidPlans: false,
      excludeListId: null,
      steps: [{ ...emptyStep(), delayDays: 0 }],
    });
    setSpamResult(null);
  };

  const sequenceTriggerLabel = (seq: MailSequence | { triggerType: string; triggerPlanCode?: string | null; triggerPlanCodes?: string | null }) => {
    if (seq.triggerType === 'new_user') return 'Новые пользователи';
    if (seq.triggerType === 'plan_purchase') {
      const codes = parseSequencePlanCodes(seq);
      const titles = codes.map((c) => PLAN_OPTIONS.find((p) => p.code === c)?.title || c);
      return `Покупка тарифа: ${titles.length > 0 ? titles.join(', ') : '—'}`;
    }
    if (seq.triggerType === 'manual') return 'По списку (один раз)';
    return 'По списку (один раз)';
  };

  const sequenceExclusionLabel = (seq: MailSequence) => {
    const parts: string[] = [];
    if (seq.excludeAllPaidPlans) parts.push('все платные тарифы');
    const excludePlans = parseSequenceExcludePlanCodes(seq);
    if (excludePlans.length > 0) {
      parts.push(
        excludePlans.map((c) => PLAN_OPTIONS.find((p) => p.code === c)?.title || c).join(', ')
      );
    }
    if (seq.excludeListName) parts.push(`список «${seq.excludeListName}»`);
    return parts.length > 0 ? parts.join('; ') : null;
  };

  const sequenceStatus = (seq: MailSequence) => {
    if (!seq.launchedAt) return { label: 'Черновик', badge: styles.badgeDraft };
    if (!seq.isActive) return { label: 'Приостановлена', badge: styles.badgePaused };
    const stats = seq.stats;
    if (stats && stats.enrollments.total > 0 && stats.enrollments.active === 0) {
      return { label: 'Завершена', badge: styles.badgeDone };
    }
    return { label: 'Работает', badge: styles.badgeActive };
  };

  const saveSequence = async () => {
    if (!editingSequence?.name || editingSequence.steps.length === 0) {
      setError('Укажите название и хотя бы одно письмо');
      return;
    }
    if (editingSequence.triggerType === 'plan_purchase' && editingSequence.triggerPlanCodes.length === 0) {
      setError('Выберите хотя бы один тариф для триггера');
      return;
    }
    setLoading(true);
    try {
      const isNew = !editingSequence.id;
      const url = isNew ? '/api/admin/mail/sequences' : `/api/admin/mail/sequences/${editingSequence.id}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingSequence),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Ошибка');
        return;
      }
      setEditingSequence(null);
      await loadSequences(sequencesPage);
      showMsg('Цепочка сохранена');
    } finally {
      setLoading(false);
    }
  };

  const launchSequenceOnList = async (seq: MailSequence) => {
    const listId = sequenceLaunchLists[seq.id];
    if (!listId) {
      setError('Выберите список для запуска');
      return;
    }
    if (!confirm(`Запустить цепочку «${seq.name}» для списка?\n\nЭто действие одноразовое — повторно запустить нельзя.`)) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/mail/sequences/${seq.id}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Ошибка запуска');
        return;
      }
      const parts = [
        `добавлено: ${data.enrolled}`,
        data.alreadyEnrolled ? `уже были: ${data.alreadyEnrolled}` : '',
        data.notMailable ? `без email: ${data.notMailable}` : '',
        data.immediateSent ? `отправлено сейчас: ${data.immediateSent}` : '',
      ].filter(Boolean);
      showMsg(`Цепочка запущена (${parts.join(', ')})`);
      await loadSequences(sequencesPage);
    } finally {
      setLoading(false);
    }
  };

  const enableSequence = async (seq: MailSequence) => {
    const isResume = !!seq.launchedAt;
    let msg: string;
    if (isResume) {
      msg = `Возобновить цепочку «${seq.name}»?`;
    } else if (seq.triggerType === 'plan_purchase') {
      msg = `Включить цепочку «${seq.name}»?\n\nПри покупке тарифа «${sequenceTriggerLabel(seq).replace('Покупка тарифа: ', '')}» пользователь автоматически попадёт в цепочку.`;
    } else {
      msg = `Включить цепочку «${seq.name}» для новых пользователей?\n\nНовые регистрации будут автоматически попадать в цепочку.`;
    }
    if (!confirm(msg)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/mail/sequences/${seq.id}/enable`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Ошибка');
        return;
      }
      showMsg(
        isResume
          ? 'Цепочка возобновлена'
          : seq.triggerType === 'plan_purchase'
            ? 'Цепочка включена для покупок тарифа'
            : 'Цепочка включена для новых пользователей'
      );
      await loadSequences(sequencesPage);
    } finally {
      setLoading(false);
    }
  };

  const pauseSequence = async (seq: MailSequence) => {
    if (!confirm(`Приостановить цепочку «${seq.name}»? Отправка писем остановится.`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/mail/sequences/${seq.id}/pause`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Ошибка');
        return;
      }
      showMsg('Цепочка приостановлена');
      await loadSequences(sequencesPage);
    } finally {
      setLoading(false);
    }
  };

  const deleteSequence = async (seq: MailSequence) => {
    if (!confirm(`Удалить цепочку «${seq.name}» и все связанные данные?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/mail/sequences/${seq.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Не удалось удалить');
        return;
      }
      if (editingSequence?.id === seq.id) setEditingSequence(null);
      if (expandedSequenceId === seq.id) setExpandedSequenceId(null);
      showMsg('Цепочка удалена');
      await loadSequences(sequencesPage);
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      draft: 'Черновик',
      scheduled: 'Запланирована',
      queued: 'В очереди',
      sending: 'Отправляется',
      sent: 'Отправлено',
      partial: 'Частично',
      failed: 'Ошибка',
      pending: 'В очереди',
    };
    return map[s] || s;
  };

  const historyUrl = useMemo(() => {
    const params = new URLSearchParams({
      period: historyPeriod,
      status: historyStatus,
      source: historySource,
      page: String(historyPage),
      limit: '50',
    });
    if (historyPeriod === 'custom') {
      params.set('from', historyFrom);
      params.set('to', historyTo);
    }
    if (historyEmail.trim()) params.set('email', historyEmail.trim());
    return `/api/admin/mail/history?${params.toString()}`;
  }, [historyPeriod, historyFrom, historyTo, historyStatus, historySource, historyEmail, historyPage]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setError(null);
    try {
      const res = await fetch(historyUrl);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Не удалось загрузить историю');
        return;
      }
      setHistory(data);
    } catch {
      setError('Ошибка сети при загрузке истории');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyUrl]);

  useEffect(() => {
    if (tab === 'history') {
      loadHistory();
    }
  }, [tab, loadHistory]);

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Рассылки</h1>
      <p className={styles.subtitle}>Email-рассылки, цепочки писем и управление списками</p>

      <div className={styles.tabs}>
        {(['campaigns', 'sequences', 'lists', 'footer', 'history'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'campaigns' && 'Разовые рассылки'}
            {t === 'sequences' && 'Цепочки писем'}
            {t === 'lists' && 'Списки'}
            {t === 'footer' && 'Футер писем'}
            {t === 'history' && 'История'}
          </button>
        ))}
      </div>

      {message && <div className={styles.success}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      {tab === 'campaigns' && (
        <div className={styles.section}>
          {!editingCampaign ? (
            <>
              <div className={styles.row}>
                <button type="button" className={styles.btnPrimary} onClick={startNewCampaign}>
                  + Новая рассылка
                </button>
                <button type="button" className={styles.btnSecondary} onClick={() => loadCampaigns(campaignsPage)} disabled={campaignsLoading}>
                  Обновить
                </button>
              </div>
              {!campaignsLoaded ? (
                <div className={styles.tabLoading}>Загрузка рассылок...</div>
              ) : (
              <>
              {campaignsLoading && <div className={styles.tabLoadingInline}>Обновление...</div>}
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Название</th>
                      <th>Аудитория</th>
                      <th>Статус</th>
                      <th>Прогресс / Время</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>
                          {c.audienceType === 'all' && 'Все пользователи'}
                          {c.audienceType === 'plan' && `Тариф: ${c.audiencePlanCode}`}
                          {c.audienceType === 'list' && `Список #${c.audienceListId}`}
                          {c.audienceType === 'previous_campaign' && `Получали #${c.previousCampaignId}`}
                        </td>
                        <td>{statusLabel(c.status)}</td>
                        <td>
                          {c.status === 'scheduled' && c.scheduledAt
                            ? new Date(c.scheduledAt).toLocaleString('ru-RU')
                            : `${c.sentCount}/${c.totalRecipients}`}
                          {c.failedCount > 0 && c.status !== 'scheduled' && ` (${c.failedCount} ошибок)`}
                        </td>
                        <td className={styles.actions}>
                          {c.status === 'scheduled' && (
                            <button
                              type="button"
                              className={styles.btnSmall}
                              onClick={() => cancelCampaignSchedule(c.id)}
                            >
                              Отменить
                            </button>
                          )}
                          {(c.status === 'draft' || c.status === 'failed' || c.status === 'scheduled') && (
                            <>
                              <button
                                type="button"
                                className={styles.btnSmall}
                                onClick={async () => {
                                  await loadListOptions();
                                  setEditingCampaign(c);
                                  if (c.scheduledAt) {
                                    setCampaignSendMode('schedule');
                                    setCampaignScheduledAt(toDatetimeLocal(new Date(c.scheduledAt)));
                                  } else {
                                    setCampaignSendMode('now');
                                    setCampaignScheduledAt(defaultScheduleDatetime());
                                  }
                                }}
                              >
                                Изменить
                              </button>
                              {c.status !== 'scheduled' && (
                                <button type="button" className={styles.btnSmallPrimary} onClick={() => sendCampaign(c.id)}>
                                  Отправить
                                </button>
                              )}
                            </>
                          )}
                          {c.status === 'sent' && listOptions.length > 0 && (
                            <select
                              className={styles.selectInline}
                              defaultValue=""
                              onChange={(e) => {
                                const listId = Number(e.target.value);
                                if (listId) addCampaignToList(c.id, listId);
                                e.target.value = '';
                              }}
                            >
                              <option value="">→ В список</option>
                              {listOptions.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                            </select>
                          )}
                          {c.status !== 'sending' && c.status !== 'queued' && (
                            <button
                              type="button"
                              className={styles.btnSmallDanger}
                              onClick={() => deleteCampaign(c)}
                              disabled={loading}
                            >
                              Удалить
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {campaigns.length === 0 && !campaignsLoading && (
                      <tr>
                        <td colSpan={5} className={styles.empty}>
                          Нет рассылок
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <AdminPagination
                page={campaignsPage}
                totalPages={campaignsTotalPages}
                total={campaignsTotal}
                onPageChange={setCampaignsPage}
              />
              </>
              )}
            </>
          ) : (
            <div className={styles.form}>
              <h2>{editingCampaign.id ? 'Редактирование' : 'Новая рассылка'}</h2>
              <label className={styles.label}>
                Название (внутреннее)
                <input
                  className={styles.input}
                  value={editingCampaign.name || ''}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, name: e.target.value })}
                />
              </label>
              <label className={styles.label}>
                Тема письма
                <input
                  className={styles.input}
                  value={editingCampaign.subject || ''}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, subject: e.target.value })}
                />
              </label>
              <label className={styles.label}>
                Аудитория
                <select
                  className={styles.select}
                  value={editingCampaign.audienceType || 'all'}
                  onChange={(e) => {
                    const audienceType = e.target.value;
                    setEditingCampaign({
                      ...editingCampaign,
                      audienceType,
                      ...(audienceType === 'list' ? {} : { audienceListId: null }),
                    });
                    if (audienceType === 'list') loadListOptions();
                  }}
                >
                  <option value="all">Все зарегистрированные пользователи</option>
                  <option value="plan">По тарифу</option>
                  <option value="list">По списку</option>
                  <option value="previous_campaign">Получали предыдущую рассылку</option>
                </select>
              </label>
              {editingCampaign.audienceType === 'plan' && (
                <label className={styles.label}>
                  Тариф
                  <select
                    className={styles.select}
                    value={editingCampaign.audiencePlanCode || 'free'}
                    onChange={(e) =>
                      setEditingCampaign({ ...editingCampaign, audiencePlanCode: e.target.value as PlanCode })
                    }
                  >
                    {PLAN_OPTIONS.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {editingCampaign.audienceType === 'list' && (
                <label className={styles.label}>
                  Список получателей
                  <div className={styles.row}>
                    <select
                      className={styles.select}
                      value={
                        editingCampaign.audienceListId != null ? String(editingCampaign.audienceListId) : ''
                      }
                      onChange={(e) =>
                        setEditingCampaign({
                          ...editingCampaign,
                          audienceListId: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    >
                      <option value="">Выберите список</option>
                      {listOptions.map((l) => (
                        <option key={l.id} value={String(l.id)}>
                          {l.name} ({l.memberCount ?? 0} чел.)
                        </option>
                      ))}
                    </select>
                    <button type="button" className={styles.btnSecondary} onClick={() => loadListOptions()}>
                      Обновить
                    </button>
                  </div>
                  {listOptions.length === 0 && (
                    <span className={styles.fieldError}>
                      Списков нет. Создайте во вкладке «Списки», затем нажмите «Обновить».
                    </span>
                  )}
                </label>
              )}
              {editingCampaign.audienceType === 'previous_campaign' && (
                <label className={styles.label}>
                  Предыдущая рассылка
                  <select
                    className={styles.select}
                    value={
                      editingCampaign.previousCampaignId != null
                        ? String(editingCampaign.previousCampaignId)
                        : ''
                    }
                    onChange={(e) =>
                      setEditingCampaign({
                        ...editingCampaign,
                        previousCampaignId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                  <option value="">Выберите рассылку</option>
                  {campaignOptions
                    .filter((c) => c.status === 'sent' && c.id !== editingCampaign.id)
                    .map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name} ({c.sentCount} получ.)
                      </option>
                    ))}
                </select>
                </label>
              )}
              <label className={styles.label}>Текст письма</label>
              <EmailEditor
                value={editingCampaign.htmlBody || ''}
                onChange={(html) => setEditingCampaign({ ...editingCampaign, htmlBody: html })}
              />
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  disabled={spamChecking}
                  onClick={() =>
                    runSpamCheck(editingCampaign.subject || '', editingCampaign.htmlBody || '')
                  }
                >
                  {spamChecking ? 'Проверка...' : 'Проверить ИИ'}
                </button>
                {spamResult?.rewrittenHtml && (
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() =>
                      setEditingCampaign({ ...editingCampaign, htmlBody: spamResult.rewrittenHtml! })
                    }
                  >
                    Применить переписанный текст
                  </button>
                )}
              </div>
              {spamResult && (
                <div className={styles.spamBox}>
                  <p>
                    <strong>Оценка доставляемости:</strong> {spamResult.score}/100
                  </p>
                  <p>{spamResult.summary}</p>
                  {spamResult.issues.length > 0 && (
                    <ul>
                      {spamResult.issues.map((issue, i) => (
                        <li key={i}>
                          «{issue.text}» — {issue.reason}. {issue.suggestion}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className={styles.row}>
                <button type="button" className={styles.btnPrimary} onClick={saveCampaign} disabled={loading}>
                  Сохранить черновик
                </button>
                <button type="button" className={styles.btnSecondary} onClick={() => setEditingCampaign(null)}>
                  Отмена
                </button>
              </div>

              <div className={styles.scheduleBox}>
                <h3>Отправка</h3>
                <div className={styles.row}>
                  <label className={styles.checkboxRow}>
                    <input
                      type="radio"
                      checked={campaignSendMode === 'now'}
                      onChange={() => setCampaignSendMode('now')}
                    />
                    Отправить сейчас
                  </label>
                  <label className={styles.checkboxRow}>
                    <input
                      type="radio"
                      checked={campaignSendMode === 'schedule'}
                      onChange={() => setCampaignSendMode('schedule')}
                    />
                    Запланировать
                  </label>
                </div>
                {campaignSendMode === 'schedule' && (
                  <label className={styles.label}>
                    Дата и время
                    <input
                      type="datetime-local"
                      className={styles.input}
                      value={campaignScheduledAt}
                      onChange={(e) => setCampaignScheduledAt(e.target.value)}
                    />
                    {validateScheduleDatetime(campaignScheduledAt) && (
                      <span className={styles.fieldError}>{validateScheduleDatetime(campaignScheduledAt)}</span>
                    )}
                  </label>
                )}
                <div className={styles.row}>
                  {campaignSendMode === 'now' ? (
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={loading}
                      onClick={() => launchCampaign(false)}
                    >
                      Отправить сейчас
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={loading || !!validateScheduleDatetime(campaignScheduledAt)}
                      onClick={() => launchCampaign(true)}
                    >
                      Запланировать отправку
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'sequences' && (
        <div className={styles.section}>
          {!editingSequence ? (
            <>
              <div className={styles.row}>
                <button type="button" className={styles.btnPrimary} onClick={startNewSequence}>
                  + Новая цепочка
                </button>
                <button type="button" className={styles.btnSecondary} onClick={() => loadSequences(sequencesPage)} disabled={sequencesLoading}>
                  Обновить
                </button>
              </div>
              <p className={styles.hint}>
                1) Создайте цепочку и сохраните черновик. 2) Запустите: по списку, для новых пользователей или при
                покупке тарифа. 3) Следите за статусами. Повторный запуск невозможен — только приостановка или
                удаление.
              </p>
              {!sequencesLoaded ? (
                <div className={styles.tabLoading}>Загрузка цепочек...</div>
              ) : (
              <>
              {sequencesLoading && <div className={styles.tabLoadingInline}>Обновление...</div>}
              {sequences.map((seq) => {
                const status = sequenceStatus(seq);
                const stats = seq.stats;
                const isLaunched = !!seq.launchedAt;
                const isAutoTrigger = seq.triggerType === 'new_user' || seq.triggerType === 'plan_purchase';
                const canLaunchByList = !isLaunched && !isAutoTrigger && (seq.steps?.length || 0) > 0;
                const canEnableAuto = !isLaunched && isAutoTrigger && (seq.steps?.length || 0) > 0;
                const isExpanded = expandedSequenceId === seq.id;

                return (
                  <div key={seq.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <strong>{seq.name}</strong>
                      <span className={status.badge}>{status.label}</span>
                    </div>
                    <p className={styles.hint}>
                      {seq.steps?.length || 0} писем · {sequenceTriggerLabel(seq)}
                      {isLaunched && seq.launchedAt && (
                        <> · Запущена {new Date(seq.launchedAt).toLocaleString('ru-RU')}</>
                      )}
                      {seq.launchListName && <> · Список: {seq.launchListName}</>}
                    </p>
                    {sequenceExclusionLabel(seq) && (
                      <p className={styles.hint}>Исключения: {sequenceExclusionLabel(seq)}</p>
                    )}
                    {stats && isLaunched && (
                      <div className={styles.statsRow}>
                        <span>
                          В цепочке: <strong>{stats.enrollments.active}</strong>
                          {' · '}
                          Завершили: <strong>{stats.enrollments.completed}</strong>
                          {' · '}
                          Сегодня писем: <strong>{stats.sends.sentToday ?? 0}</strong>
                        </span>
                        <span className={styles.hint}>
                          Всего участников {stats.enrollments.total}
                          {stats.enrollments.unsubscribed > 0 &&
                            `, отписались ${stats.enrollments.unsubscribed}`}
                          {' · '}
                          отправлено {stats.sends.sent}
                          {stats.sends.pending > 0 && `, в очереди ${stats.sends.pending}`}
                          {stats.sends.failed > 0 && `, ошибок ${stats.sends.failed}`}
                        </span>
                      </div>
                    )}
                    <div className={styles.row}>
                      {!isLaunched && (
                        <button
                          type="button"
                          className={styles.btnSmall}
                          onClick={async () => {
                            setLoading(true);
                            try {
                              const res = await fetch(`/api/admin/mail/sequences/${seq.id}`);
                              const data = await res.json();
                              if (!res.ok) {
                                setError(data.error || 'Не удалось загрузить');
                                return;
                              }
                              setEditingSequence({
                                id: data.sequence.id,
                                name: data.sequence.name,
                                description: data.sequence.description || '',
                                triggerType:
                                  data.sequence.triggerType === 'none' ? 'manual' : data.sequence.triggerType,
                                triggerPlanCodes: parseSequencePlanCodes(data.sequence).length
                                  ? parseSequencePlanCodes(data.sequence)
                                  : ['hours24'],
                                excludePlanCodes: parseSequenceExcludePlanCodes(data.sequence),
                                excludeAllPaidPlans: !!data.sequence.excludeAllPaidPlans,
                                excludeListId: data.sequence.excludeListId ?? null,
                                steps: data.steps?.length
                                  ? data.steps.map((s: SequenceStep) => ({
                                      delayDays: s.delayDays,
                                      delayHours: s.delayHours,
                                      subject: s.subject,
                                      htmlBody: s.htmlBody || '<p></p>',
                                    }))
                                  : [emptyStep()],
                              });
                            } finally {
                              setLoading(false);
                            }
                          }}
                        >
                          Редактировать
                        </button>
                      )}
                      {canLaunchByList && (
                        <>
                          <select
                            className={styles.selectInline}
                            value={
                              sequenceLaunchLists[seq.id] ? String(sequenceLaunchLists[seq.id]) : ''
                            }
                            onChange={(e) =>
                              setSequenceLaunchLists((prev) => ({
                                ...prev,
                                [seq.id]: e.target.value ? Number(e.target.value) : 0,
                              }))
                            }
                          >
                            <option value="">Список для запуска</option>
                            {listOptions.map((l) => (
                              <option key={l.id} value={String(l.id)}>
                                {l.name} ({l.memberCount ?? 0})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className={styles.btnSmallPrimary}
                            onClick={() => launchSequenceOnList(seq)}
                            disabled={loading || !sequenceLaunchLists[seq.id]}
                          >
                            Запустить по списку
                          </button>
                        </>
                      )}
                      {canEnableAuto && (
                        <button
                          type="button"
                          className={styles.btnSmallPrimary}
                          onClick={() => enableSequence(seq)}
                          disabled={loading}
                        >
                          {seq.triggerType === 'plan_purchase' ? 'Включить для тарифа' : 'Включить для новых'}
                        </button>
                      )}
                      {isLaunched && seq.isActive && (
                        <button
                          type="button"
                          className={styles.btnSmall}
                          onClick={() => pauseSequence(seq)}
                          disabled={loading}
                        >
                          Приостановить
                        </button>
                      )}
                      {isLaunched && !seq.isActive && (
                        <button
                          type="button"
                          className={styles.btnSmallPrimary}
                          onClick={() => enableSequence(seq)}
                          disabled={loading}
                        >
                          Возобновить
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.btnSmall}
                        onClick={() => setExpandedSequenceId(isExpanded ? null : seq.id)}
                      >
                        {isExpanded ? 'Скрыть детали' : 'Детали'}
                      </button>
                      <button
                        type="button"
                        className={styles.btnSmallDanger}
                        onClick={() => deleteSequence(seq)}
                        disabled={loading}
                      >
                        Удалить
                      </button>
                    </div>
                    {isExpanded && stats && (
                      <div className={styles.stepProgress}>
                        <h4>Прогресс по письмам</h4>
                        {stats.steps.length === 0 ? (
                          <p className={styles.hint}>Нет писем</p>
                        ) : (
                          <table className={styles.miniTable}>
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Тема</th>
                                <th>Отправлено</th>
                                <th>В очереди</th>
                                <th>Ошибки</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stats.steps.map((step) => (
                                <tr key={step.stepOrder}>
                                  <td>{step.stepOrder}</td>
                                  <td>{step.subject || '—'}</td>
                                  <td>{step.sent}</td>
                                  <td>{step.pending}</td>
                                  <td>{step.failed}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {sequences.length === 0 && !sequencesLoading && <p className={styles.empty}>Нет цепочек</p>}
              <AdminPagination
                page={sequencesPage}
                totalPages={sequencesTotalPages}
                total={sequencesTotal}
                onPageChange={setSequencesPage}
              />
              </>
              )}
            </>
          ) : (
            <div className={styles.form}>
              <h2>{editingSequence.id ? 'Редактирование цепочки' : 'Новая цепочка'}</h2>
              <label className={styles.label}>
                Название
                <input
                  className={styles.input}
                  value={editingSequence.name}
                  onChange={(e) => setEditingSequence({ ...editingSequence, name: e.target.value })}
                />
              </label>
              <label className={styles.label}>
                Триггер запуска
                <select
                  className={styles.select}
                  value={editingSequence.triggerType}
                  onChange={(e) => setEditingSequence({ ...editingSequence, triggerType: e.target.value })}
                >
                  <option value="manual">По списку (запуск один раз вручную)</option>
                  <option value="new_user">Новые пользователи (при регистрации)</option>
                  <option value="plan_purchase">Покупка тарифа</option>
                </select>
              </label>
              {editingSequence.triggerType === 'plan_purchase' && (
                <div className={styles.label}>
                  Тарифы (можно несколько)
                  <div className={styles.row} style={{ flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
                    {PAID_PLAN_OPTIONS.map((p) => (
                      <label key={p.code} className={styles.checkboxRow} style={{ marginBottom: 0 }}>
                        <input
                          type="checkbox"
                          checked={editingSequence.triggerPlanCodes.includes(p.code)}
                          onChange={() =>
                            setEditingSequence({
                              ...editingSequence,
                              triggerPlanCodes: togglePlanCode(editingSequence.triggerPlanCodes, p.code),
                            })
                          }
                        />
                        {p.title}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className={styles.scheduleBox}>
                <h3>Исключения</h3>
                <p className={styles.hint}>
                  Пользователи из исключений не попадут в цепочку. Если купят указанный тариф — активная цепочка для
                  них остановится.
                </p>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={editingSequence.excludeAllPaidPlans}
                    onChange={(e) =>
                      setEditingSequence({ ...editingSequence, excludeAllPaidPlans: e.target.checked })
                    }
                  />
                  Исключить все платные тарифы
                </label>
                <div className={styles.label}>
                  Исключить тарифы
                  <div className={styles.row} style={{ flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
                    {PAID_PLAN_OPTIONS.map((p) => (
                      <label key={p.code} className={styles.checkboxRow} style={{ marginBottom: 0 }}>
                        <input
                          type="checkbox"
                          checked={editingSequence.excludePlanCodes.includes(p.code)}
                          onChange={() =>
                            setEditingSequence({
                              ...editingSequence,
                              excludePlanCodes: togglePlanCode(editingSequence.excludePlanCodes, p.code),
                            })
                          }
                        />
                        {p.title}
                      </label>
                    ))}
                  </div>
                </div>
                <label className={styles.label}>
                  Исключить список пользователей
                  <select
                    className={styles.select}
                    value={editingSequence.excludeListId ?? ''}
                    onChange={(e) =>
                      setEditingSequence({
                        ...editingSequence,
                        excludeListId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">Не исключать</option>
                    {listOptions.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className={styles.hint}>
                Сохраните черновик, затем на экране цепочек нажмите «Запустить по списку», «Включить для новых» или
                «Включить для тарифа». Активация происходит при запуске.
              </p>
              {editingSequence.steps.map((step, idx) => (
                <div key={idx} className={styles.stepCard}>
                  <h3>
                    Письмо {idx + 1}
                    {idx > 0 && (
                      <button
                        type="button"
                        className={styles.btnSmallDanger}
                        onClick={() => {
                          const steps = editingSequence.steps.filter((_, i) => i !== idx);
                          setEditingSequence({ ...editingSequence, steps });
                        }}
                      >
                        Удалить
                      </button>
                    )}
                  </h3>
                  <div className={styles.row}>
                    <label className={styles.label}>
                      Задержка (дней)
                      <input
                        type="number"
                        min={0}
                        className={styles.inputShort}
                        value={step.delayDays}
                        onChange={(e) => {
                          const steps = [...editingSequence.steps];
                          steps[idx] = { ...step, delayDays: Number(e.target.value) };
                          setEditingSequence({ ...editingSequence, steps });
                        }}
                      />
                    </label>
                    <label className={styles.label}>
                      Часов
                      <input
                        type="number"
                        min={0}
                        max={23}
                        className={styles.inputShort}
                        value={step.delayHours}
                        onChange={(e) => {
                          const steps = [...editingSequence.steps];
                          steps[idx] = { ...step, delayHours: Number(e.target.value) };
                          setEditingSequence({ ...editingSequence, steps });
                        }}
                      />
                    </label>
                  </div>
                  <p className={styles.hint}>
                    {idx === 0
                      ? 'Задержка до первого письма после регистрации/запуска'
                      : 'Задержка после предыдущего письма'}
                  </p>
                  <input
                    className={styles.input}
                    placeholder="Тема"
                    value={step.subject}
                    onChange={(e) => {
                      const steps = [...editingSequence.steps];
                      steps[idx] = { ...step, subject: e.target.value };
                      setEditingSequence({ ...editingSequence, steps });
                    }}
                  />
                  <EmailEditor
                    value={step.htmlBody}
                    onChange={(html) => {
                      const steps = [...editingSequence.steps];
                      steps[idx] = { ...step, htmlBody: html };
                      setEditingSequence({ ...editingSequence, steps });
                    }}
                  />
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    disabled={spamChecking}
                    onClick={() => runSpamCheck(step.subject, step.htmlBody)}
                  >
                    Проверить ИИ
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() =>
                  setEditingSequence({
                    ...editingSequence,
                    steps: [...editingSequence.steps, emptyStep()],
                  })
                }
              >
                + Добавить письмо
              </button>
              {spamResult && (
                <div className={styles.spamBox}>
                  <p>
                    Оценка: {spamResult.score}/100 — {spamResult.summary}
                  </p>
                </div>
              )}
              <div className={styles.row}>
                <button type="button" className={styles.btnPrimary} onClick={saveSequence} disabled={loading}>
                  Сохранить цепочку
                </button>
                <button type="button" className={styles.btnSecondary} onClick={() => setEditingSequence(null)}>
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'lists' && (
        <div className={styles.section}>
          <div className={styles.row}>
            <input
              className={styles.input}
              placeholder="Название списка"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
            />
            <button type="button" className={styles.btnPrimary} onClick={createList}>
              Создать список
            </button>
          </div>
          {!listsLoaded ? (
            <div className={styles.tabLoading}>Загрузка списков...</div>
          ) : (
          <>
          {listsLoading && <div className={styles.tabLoadingInline}>Обновление...</div>}
          <div className={styles.listsGrid}>
            {lists.map((list) => (
              <button
                key={list.id}
                type="button"
                className={`${styles.listCard} ${selectedListId === list.id ? styles.listCardActive : ''}`}
                onClick={() => selectList(list.id)}
              >
                <strong>{list.name}</strong>
                <span>{list.memberCount ?? 0} получателей</span>
              </button>
            ))}
          </div>
          <AdminPagination
            page={listsPage}
            totalPages={listsTotalPages}
            total={listsTotal}
            onPageChange={setListsPage}
          />
          {lists.length === 0 && !listsLoading && (
            <p className={styles.empty}>Списков пока нет — создайте первый выше</p>
          )}
          </>
          )}
          {selectedListId && (
            <>
              <div className={styles.addMembersPanel}>
                <h3>Добавить в список</h3>
                <div className={styles.addModeTabs}>
                  {(['search', 'list', 'plan', 'dates'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`${styles.tab} ${listAddMode === mode ? styles.tabActive : ''}`}
                      onClick={() => setListAddMode(mode)}
                    >
                      {mode === 'search' && 'По email'}
                      {mode === 'list' && 'Из списка'}
                      {mode === 'plan' && 'По тарифу'}
                      {mode === 'dates' && 'По дате регистрации'}
                    </button>
                  ))}
                </div>

                {listAddMode === 'search' && (
                  <div className={styles.addModeBody}>
                    <div className={styles.row}>
                      <input
                        className={styles.input}
                        placeholder="Начало email, например ivan@"
                        value={userSearchEmail}
                        onChange={(e) => setUserSearchEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && searchUsersForList()}
                      />
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={() => searchUsersForList()}
                        disabled={listAddLoading}
                      >
                        Найти
                      </button>
                    </div>
                    {userSearchResults.length > 0 && (
                      <>
                        <div className={styles.userPickList}>
                          {userSearchResults.map((u) => (
                            <label key={u.id} className={styles.userPickRow}>
                              <input
                                type="checkbox"
                                checked={selectedUserIds.has(u.id)}
                                onChange={() => toggleUserSelection(u.id)}
                              />
                              <span>{u.email}</span>
                              <span className={styles.hint}>{u.name || '—'}</span>
                            </label>
                          ))}
                        </div>
                        <button
                          type="button"
                          className={styles.btnPrimary}
                          disabled={listAddLoading || selectedUserIds.size === 0}
                          onClick={addSelectedUsersToList}
                        >
                          Добавить выбранных ({selectedUserIds.size})
                        </button>
                        {userSearchResults.length < userSearchTotal && (
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            disabled={listAddLoading}
                            onClick={() => searchUsersForList(true)}
                          >
                            Показать ещё ({userSearchResults.length} из {userSearchTotal})
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {listAddMode === 'list' && (
                  <div className={styles.addModeBody}>
                    <select
                      className={styles.input}
                      value={bulkFromListId}
                      onChange={(e) => setBulkFromListId(e.target.value ? Number(e.target.value) : '')}
                    >
                      <option value="">Выберите список</option>
                      {listOptions
                        .filter((l) => l.id !== selectedListId)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name} ({l.memberCount ?? 0})
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={!bulkFromListId || listAddLoading}
                      onClick={() => bulkAddToList({ fromListId: bulkFromListId })}
                    >
                      Добавить всех из списка
                    </button>
                  </div>
                )}

                {listAddMode === 'plan' && (
                  <div className={styles.addModeBody}>
                    <select
                      className={styles.input}
                      value={bulkPlanCode}
                      onChange={(e) => setBulkPlanCode(e.target.value as PlanCode)}
                    >
                      {PLAN_OPTIONS.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={listAddLoading}
                      onClick={() => bulkAddToList({ planCode: bulkPlanCode })}
                    >
                      Добавить всех с этим тарифом
                    </button>
                  </div>
                )}

                {listAddMode === 'dates' && (
                  <div className={styles.addModeBody}>
                    <div className={styles.row}>
                      <label className={styles.filterLabel}>
                        Зарегистрированы от
                        <DatePicker value={bulkRegFrom} onChange={setBulkRegFrom} theme="dark" className={styles.input} />
                      </label>
                      <label className={styles.filterLabel}>
                        до
                        <DatePicker value={bulkRegTo} onChange={setBulkRegTo} theme="dark" className={styles.input} />
                      </label>
                    </div>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={listAddLoading || (!bulkRegFrom && !bulkRegTo)}
                      onClick={() =>
                        bulkAddToList({
                          registeredFrom: bulkRegFrom || undefined,
                          registeredTo: bulkRegTo || undefined,
                        })
                      }
                    >
                      Добавить по датам регистрации
                    </button>
                  </div>
                )}
              </div>

              <div className={styles.tableWrap}>
                <h3>Участники списка {listMembersLoading && <span className={styles.hint}>— загрузка...</span>}</h3>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Имя</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {listMembers.map((m) => (
                      <tr key={m.userId}>
                        <td>{m.user?.email || '—'}</td>
                        <td>{m.user?.name || '—'}</td>
                        <td>
                          <button
                            type="button"
                            className={styles.btnSmallDanger}
                            onClick={async () => {
                              await fetch(`/api/admin/mail/lists/${selectedListId}/members`, {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: m.userId }),
                              });
                              await loadListMembers(selectedListId, listMembersPage);
                              await loadLists(listsPage);
                              await loadListOptions();
                            }}
                          >
                            Удалить
                          </button>
                        </td>
                      </tr>
                    ))}
                    {listMembers.length === 0 && (
                      <tr>
                        <td colSpan={3} className={styles.empty}>
                          Список пуст — добавьте получателей выше
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <AdminPagination
                page={listMembersPage}
                totalPages={listMembersTotalPages}
                total={listMembersTotal}
                loading={listMembersLoading}
                onPageChange={(page) => {
                  if (selectedListId) void loadListMembers(selectedListId, page);
                }}
              />
            </>
          )}
        </div>
      )}

      {tab === 'footer' && (
        <div className={styles.section}>
          <p className={styles.hint}>
            Общий футер для всех писем. Используйте {'{{unsubscribe_url}}'} для ссылки отписки.
          </p>
          <EmailEditor value={footerHtml} onChange={setFooterHtml} placeholder="HTML футера..." />
          <div className={styles.row}>
            <button type="button" className={styles.btnPrimary} onClick={saveFooter} disabled={loading}>
              Сохранить футер
            </button>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className={styles.section}>
          <div className={styles.historyFilters}>
            <label className={styles.filterLabel}>
              Период
              <select
                className={styles.input}
                value={historyPeriod}
                onChange={(e) => {
                  setHistoryPage(1);
                  setHistoryPeriod(e.target.value as HistoryPeriod);
                }}
              >
                <option value="week">Неделя</option>
                <option value="month">Месяц</option>
                <option value="custom">Выбранные даты</option>
              </select>
            </label>
            {historyPeriod === 'custom' && (
              <>
                <label className={styles.filterLabel}>
                  От
                  <DatePicker value={historyFrom} onChange={setHistoryFrom} theme="dark" className={styles.input} />
                </label>
                <label className={styles.filterLabel}>
                  До
                  <DatePicker value={historyTo} onChange={setHistoryTo} theme="dark" className={styles.input} />
                </label>
              </>
            )}
            <label className={styles.filterLabel}>
              Статус
              <select
                className={styles.input}
                value={historyStatus}
                onChange={(e) => {
                  setHistoryPage(1);
                  setHistoryStatus(e.target.value as typeof historyStatus);
                }}
              >
                <option value="all">Все</option>
                <option value="sent">Отправлено</option>
                <option value="failed">Ошибка</option>
                <option value="pending">В очереди</option>
              </select>
            </label>
            <label className={styles.filterLabel}>
              Тип
              <select
                className={styles.input}
                value={historySource}
                onChange={(e) => {
                  setHistoryPage(1);
                  setHistorySource(e.target.value as typeof historySource);
                }}
              >
                <option value="all">Все</option>
                <option value="campaign">Разовые рассылки</option>
                <option value="sequence">Цепочки</option>
              </select>
            </label>
            <label className={styles.filterLabel}>
              Email
              <input
                className={styles.input}
                placeholder="Поиск по email"
                value={historyEmail}
                onChange={(e) => setHistoryEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setHistoryPage(1);
                    loadHistory();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => {
                setHistoryPage(1);
                loadHistory();
              }}
              disabled={historyLoading}
            >
              {historyLoading ? 'Загрузка...' : 'Показать'}
            </button>
          </div>

          {history && (
            <>
              <div className={styles.historySummary}>
                <div>
                  Всего: <strong>{history.summary.total}</strong>
                </div>
                <div>
                  Отправлено: <strong>{history.summary.sent}</strong>
                </div>
                <div>
                  Ошибок: <strong>{history.summary.failed}</strong>
                </div>
                <div>
                  В очереди: <strong>{history.summary.pending}</strong>
                </div>
                <div>
                  Период:{' '}
                  <strong>
                    {new Date(history.from).toLocaleDateString('ru-RU')} —{' '}
                    {new Date(history.to).toLocaleDateString('ru-RU')}
                  </strong>
                </div>
              </div>

              {history.byDay.length > 0 && (
                <div className={styles.byDayChart}>
                  <p className={styles.hint}>Отправлено по дням</p>
                  <div className={styles.byDayBars}>
                    {history.byDay.map((d) => {
                      const max = Math.max(...history.byDay.map((x) => x.count), 1);
                      return (
                        <div key={d.date} className={styles.byDayItem} title={`${d.date}: ${d.count}`}>
                          <div
                            className={styles.byDayBar}
                            style={{ height: `${Math.max(8, (d.count / max) * 64)}px` }}
                          />
                          <span className={styles.byDayLabel}>
                            {new Date(d.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                          </span>
                          <span className={styles.byDayCount}>{d.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Email</th>
                  <th>Тема</th>
                  <th>Источник</th>
                  <th>Статус</th>
                  <th>Ошибка</th>
                </tr>
              </thead>
              <tbody>
                {(history?.rows || []).map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.eventAt).toLocaleString('ru-RU')}</td>
                    <td>{row.email}</td>
                    <td className={styles.subjectCell}>{row.subject}</td>
                    <td>
                      <span className={row.sourceType === 'campaign' ? styles.badgeCampaign : styles.badgeSequence}>
                        {row.sourceLabel}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          row.status === 'sent'
                            ? styles.statusSent
                            : row.status === 'failed'
                              ? styles.statusFailed
                              : styles.statusPending
                        }
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className={styles.errorCell}>{row.errorMessage || '—'}</td>
                  </tr>
                ))}
                {!historyLoading && history && history.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className={styles.empty}>
                      За выбранный период отправок нет
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {history && (
            <AdminPagination
              page={history.page}
              totalPages={history.totalPages}
              total={history.total}
              loading={historyLoading}
              onPageChange={setHistoryPage}
            />
          )}
        </div>
      )}
    </div>
  );
}
