/**
 * Проверка API_GPT / OpenAI с VPS или локально.
 * npx tsx scripts/openai-ping.ts
 */
import { loadProjectEnvFiles } from '../lib/load-project-env';
import {
  getOpenAiChatCompletionParams,
  getOpenAiChatModel,
} from '../lib/openai-models';

loadProjectEnvFiles();

async function main() {
  const key = String(process.env.API_GPT || '').trim();
  const chatParams = getOpenAiChatCompletionParams();
  const chatModel = getOpenAiChatModel();
  console.log('API_GPT:', key ? `set(len=${key.length}, prefix=${key.slice(0, 7)}…)` : 'MISSING');
  console.log('OPENAI_CHAT_MODEL:', chatModel);
  console.log('chat params:', chatParams);
  if (!key) process.exit(1);

  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: key, timeout: 60_000, maxRetries: 1 });

  console.log('models.list…');
  const models = await client.models.list();
  const ids = models.data.map((m) => m.id);
  const want = [chatModel, 'gpt-4o-mini', 'gpt-4o', 'text-embedding-3-small'];
  for (const id of want) {
    console.log(`  ${id}: ${ids.includes(id) ? 'YES' : 'NO'}`);
  }

  console.log('chat.completions (gpt-4o-mini)…');
  const r = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Ответь одним словом: ok' }],
    max_tokens: 10,
  });
  console.log('mini OK:', r.choices[0]?.message?.content);

  console.log(`chat.completions (${chatModel})…`);
  try {
    const r2 = await client.chat.completions.create({
      model: chatModel,
      messages: [{ role: 'user', content: 'Ответь одним словом: ok' }],
      max_completion_tokens: Math.max(chatParams.max_completion_tokens, 2000),
      reasoning_effort: chatParams.reasoning_effort,
    });
    const content = r2.choices[0]?.message?.content;
    console.log('chat model OK:', content);
    console.log('finish_reason:', r2.choices[0]?.finish_reason);
    console.log('usage:', r2.usage);
    if (!content) {
      console.error('EMPTY content — подними OPENAI_CHAT_MAX_COMPLETION_TOKENS или понизь reasoning');
      process.exit(3);
    }
  } catch (e: any) {
    console.error('chat model FAIL:', e?.message || e);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error('OPENAI FAIL:', e?.status || '', e?.code || '', e?.message || e);
  if (e?.error) console.error(e.error);
  process.exit(1);
});
