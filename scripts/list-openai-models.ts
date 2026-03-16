// scripts/list-openai-models.ts
// Список моделей OpenAI, доступных для текущего API-ключа (берётся из API_GPT в .env.local)

import OpenAI from 'openai';

async function main() {
  const apiKey = process.env.API_GPT;
  if (!apiKey) {
    throw new Error('API_GPT не задан в окружении. Убедитесь, что он есть в .env.local и подхватывается при запуске.');
  }

  const client = new OpenAI({ apiKey });

  const res = await client.models.list();

  console.log('Доступные модели (id):');
  for (const m of res.data) {
    console.log('-', m.id);
  }
}

main().catch((err) => {
  console.error('Error listing models:', err);
  process.exit(1);
});

