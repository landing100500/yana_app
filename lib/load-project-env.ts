import fs from 'fs';
import path from 'path';

/**
 * Подгрузка env-файлов проекта (как на Beget: .env.production, иногда .env.local).
 * Не перезаписывает уже заданные process.env.
 */
export function loadProjectEnvFiles(cwd = process.cwd()): string[] {
  const files = ['.env', '.env.production', '.env.local', '.env.production.local'];
  const loaded: string[] = [];

  for (const name of files) {
    const envPath = path.join(cwd, name);
    if (!fs.existsSync(envPath)) continue;
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!key || process.env[key] !== undefined) continue;
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith("'") && val.endsWith("'")) ||
        (val.startsWith('"') && val.endsWith('"'))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
    loaded.push(name);
  }

  return loaded;
}

export function smtpEnvDiagnostics(): {
  present: Record<string, boolean>;
  missing: string[];
} {
  const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'ADMIN_ALERTS_EMAIL'];
  const present: Record<string, boolean> = {};
  const missing: string[] = [];
  for (const key of keys) {
    const ok = !!String(process.env[key] || '').trim();
    present[key] = ok;
    if (!ok && key !== 'ADMIN_ALERTS_EMAIL' && key !== 'SMTP_PORT' && key !== 'SMTP_SECURE') {
      if (key === 'SMTP_FROM' && present.SMTP_USER) continue;
      missing.push(key);
    }
  }
  if (!present.SMTP_FROM && !present.SMTP_USER) missing.push('SMTP_FROM|SMTP_USER');
  return { present, missing };
}
