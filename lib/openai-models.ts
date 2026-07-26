/** Модели OpenAI — через env, чтобы не ловить deprecation без деплоя логики. */

import type { ReasoningEffort } from 'openai/resources/shared';

const DEFAULT_CHAT_MODEL = 'gpt-5.6-sol';
const DEFAULT_MINI_MODEL = 'gpt-4o-mini';
/** Как было с gpt-5-chat-latest. При reasoning_effort=none Sol не жрёт бюджет на thinking. */
const DEFAULT_CHAT_MAX_COMPLETION_TOKENS = 1800;
/** none ≈ поведение chat-latest; minimal/low включают reasoning и замедляют/ломают старый пайплайн. */
const DEFAULT_CHAT_REASONING_EFFORT: ReasoningEffort = 'none';

export function getOpenAiChatModel(): string {
  return String(process.env.OPENAI_CHAT_MODEL || DEFAULT_CHAT_MODEL).trim() || DEFAULT_CHAT_MODEL;
}

export function getOpenAiMiniModel(): string {
  return String(process.env.OPENAI_MINI_MODEL || DEFAULT_MINI_MODEL).trim() || DEFAULT_MINI_MODEL;
}

export function getOpenAiChatMaxCompletionTokens(): number {
  const raw = Number(process.env.OPENAI_CHAT_MAX_COMPLETION_TOKENS);
  if (Number.isFinite(raw) && raw >= 500) return Math.floor(raw);
  return DEFAULT_CHAT_MAX_COMPLETION_TOKENS;
}

export function getOpenAiChatReasoningEffort(): ReasoningEffort {
  const raw = String(process.env.OPENAI_CHAT_REASONING_EFFORT || DEFAULT_CHAT_REASONING_EFFORT)
    .trim()
    .toLowerCase();
  const allowed: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
  return (allowed.includes(raw as ReasoningEffort) ? raw : DEFAULT_CHAT_REASONING_EFFORT) as ReasoningEffort;
}
