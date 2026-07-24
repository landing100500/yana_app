/** Модели OpenAI — через env, чтобы не ловить deprecation без деплоя логики. */

export function getOpenAiChatModel(): string {
  return String(process.env.OPENAI_CHAT_MODEL || 'gpt-5.6-sol').trim() || 'gpt-5.6-sol';
}

export function getOpenAiMiniModel(): string {
  return String(process.env.OPENAI_MINI_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
}
