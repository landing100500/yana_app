/** Модели OpenAI — через env, чтобы не ловить deprecation без деплоя логики. */

import type { ReasoningEffort } from 'openai/resources/shared';

const DEFAULT_CHAT_MODEL = 'gpt-5.6-sol';
const DEFAULT_MINI_MODEL = 'gpt-4o-mini';

/** Бюджет output+reasoning для Sol/GPT-5.x — 1800 часто съедается reasoning → пустой content. */
const DEFAULT_CHAT_MAX_COMPLETION_TOKENS = 12_000;
const DEFAULT_CHAT_REASONING_EFFORT: ReasoningEffort = 'low';

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

/** none|minimal|low|medium|high|xhigh — для обычного чата Ясны low достаточно. */
export function getOpenAiChatReasoningEffort(): ReasoningEffort {
  const raw = String(process.env.OPENAI_CHAT_REASONING_EFFORT || DEFAULT_CHAT_REASONING_EFFORT)
    .trim()
    .toLowerCase();
  const allowed: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
  return (allowed.includes(raw as ReasoningEffort) ? raw : DEFAULT_CHAT_REASONING_EFFORT) as ReasoningEffort;
}

/** Параметры chat.completions для основной модели (gpt-5.6-sol и аналоги). */
export function getOpenAiChatCompletionParams() {
  return {
    model: getOpenAiChatModel(),
    max_completion_tokens: getOpenAiChatMaxCompletionTokens(),
    reasoning_effort: getOpenAiChatReasoningEffort(),
  };
}
