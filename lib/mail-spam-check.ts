import { openai } from '@/lib/openai';

export interface SpamCheckIssue {
  text: string;
  reason: string;
  suggestion: string;
}

export interface SpamCheckResult {
  score: number;
  issues: SpamCheckIssue[];
  rewrittenHtml?: string;
  summary: string;
}

export async function checkEmailForSpam(subject: string, htmlBody: string): Promise<SpamCheckResult> {
  const prompt = `Ты эксперт по email-маркетингу и доставляемости писем (anti-spam).

Проанализируй тему и HTML-тело письма на русском языке. Найди слова, фразы и паттерны, которые могут повысить риск попадания в спам: агрессивные призывы, CAPS LOCK, множественные восклицательные знаки, слова "бесплатно", "скидка", "срочно", "гарантия", подозрительные ссылки, избыток эмодзи, spam-триггеры для RU-почтовиков (Mail.ru, Yandex, Gmail).

Верни ТОЛЬКО валидный JSON без markdown:
{
  "score": число от 0 до 100 (100 = отличная доставляемость),
  "summary": "краткий общий вывод на русском",
  "issues": [
    { "text": "фрагмент из письма", "reason": "почему это риск", "suggestion": "как исправить" }
  ],
  "rewrittenHtml": "переписанное HTML-тело письма с исправлениями, сохраняя смысл и структуру"
}

Тема: ${subject}

HTML тело:
${htmlBody}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(raw) as Partial<SpamCheckResult>;

  return {
    score: typeof parsed.score === 'number' ? parsed.score : 50,
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    rewrittenHtml: parsed.rewrittenHtml,
    summary: parsed.summary || 'Анализ завершён',
  };
}
