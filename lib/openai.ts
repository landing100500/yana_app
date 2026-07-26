import OpenAI from 'openai';

const apiKey = process.env.API_GPT;

if (!apiKey) {
  throw new Error('Missing OpenAI API key');
}

/** Chat/RAG не должны висеть по 30 мин × 3 ретрая — это nginx 502. */
const timeoutMs = (() => {
  const raw = Number(process.env.OPENAI_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 10_000) return Math.floor(raw);
  return 180_000; // 3 мин на один запрос (Sol + большой контекст)
})();

const maxRetries = (() => {
  const raw = Number(process.env.OPENAI_MAX_RETRIES);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 3) return Math.floor(raw);
  return 1;
})();

export const openai = new OpenAI({
  apiKey,
  timeout: timeoutMs,
  maxRetries,
});
