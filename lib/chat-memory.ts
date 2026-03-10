import { openai } from './openai';
import Message from '@/models/Message';
import ChatTopicSummary from '@/models/ChatTopicSummary';
import UserMemory from '@/models/UserMemory';

const RECENT_WINDOW = 25;

export const RECENT_MESSAGES_WINDOW = RECENT_WINDOW;

/**
 * Генерирует резюме списка сообщений (диалог пользователь/ассистент).
 */
export async function summarizeMessages(messages: { role: string; content: string }[]): Promise<string> {
  if (messages.length === 0) return '';
  const text = messages
    .map((m) => (m.role === 'user' ? `Пользователь: ${m.content}` : `Ассистент: ${m.content}`))
    .join('\n\n');
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'Ты суммаризатор. Кратко перескажи диалог между пользователем и астрологом в 5–10 предложений. Сохрани важные факты о пользователе, темы и выводы. Пиши на русском.',
      },
      { role: 'user', content: text },
    ],
    temperature: 0.3,
    max_tokens: 400,
  });
  return completion.choices[0]?.message?.content?.trim() || '';
}

/**
 * Извлекает 1–3 факта о пользователе из обмена сообщениями для долгосрочной памяти.
 */
export async function extractUserFacts(userMessage: string, assistantMessage: string): Promise<string[]> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'Из диалога извлеки 1–3 коротких факта о пользователе (имя, ситуация, предпочтения, что сказал о себе). Каждый факт — одна строка. Если нет новых фактов — ответь пустым сообщением. Только факты, без предисловий.',
      },
      {
        role: 'user',
        content: `Пользователь: ${userMessage}\n\nАссистент: ${assistantMessage}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 200,
  });
  const raw = completion.choices[0]?.message?.content?.trim() || '';
  if (!raw) return [];
  return raw
    .split('\n')
    .map((s) => s.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean);
}

/**
 * Возвращает резюме старой части диалога (если есть) и последние RECENT_WINDOW сообщений.
 */
export async function getTopicContext(
  topicId: number
): Promise<{ summary: string | null; recentMessages: { role: string; content: string }[] }> {
  const total = await Message.count({ where: { topicId } });
  let summary: string | null = null;

  if (total > RECENT_WINDOW) {
    const oldCount = total - RECENT_WINDOW;
    const oldMessages = await Message.findAll({
      where: { topicId },
      order: [['createdAt', 'ASC']],
      limit: oldCount,
      attributes: ['id', 'role', 'content'],
    });
    const lastOldId = oldMessages.length > 0 ? oldMessages[oldMessages.length - 1].id : 0;

    const existing = await ChatTopicSummary.findOne({ where: { topicId } });
    if (existing && existing.upToMessageId >= lastOldId) {
      summary = existing.summary || null;
    } else {
      const toSummarize = oldMessages.map((m) => ({ role: m.role, content: m.content }));
      const summaryText = await summarizeMessages(toSummarize);
      await ChatTopicSummary.upsert(
        { topicId, summary: summaryText, upToMessageId: lastOldId },
        { updateOnDuplicate: ['summary', 'upToMessageId'] }
      );
      summary = summaryText || null;
    }
  }

  const recent = await Message.findAll({
    where: { topicId },
    order: [['createdAt', 'ASC']],
    offset: Math.max(0, total - RECENT_WINDOW),
    limit: RECENT_WINDOW,
    attributes: ['role', 'content'],
  });

  const recentMessages = recent.map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));

  return { summary, recentMessages };
}

/**
 * Обновляет долгосрочную память пользователя новыми фактами (без дубликатов по смыслу).
 */
export async function appendUserMemory(userId: number, newFacts: string[]): Promise<void> {
  if (newFacts.length === 0) return;
  const [row] = await UserMemory.findOrCreate({ where: { userId }, defaults: { facts: '' } });
  const existing = row.facts ? row.facts.split('\n').filter(Boolean) : [];
  const combined = [...existing];
  for (const f of newFacts) {
    if (f && !combined.some((e) => e.toLowerCase() === f.toLowerCase())) combined.push(f);
  }
  const maxFacts = 50;
  row.facts = combined.slice(-maxFacts).join('\n');
  await row.save();
}
