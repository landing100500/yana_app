import OpenAI from 'openai';

const apiKey = process.env.API_GPT;

if (!apiKey) {
  throw new Error('Missing OpenAI API key');
}

export const openai = new OpenAI({
  apiKey: apiKey,
  timeout: 30 * 60 * 1000, // 30 минут таймаут для больших файлов
  maxRetries: 3,
  // Увеличиваем таймауты для больших файлов
  httpAgent: undefined, // Используем дефолтный агент
});
