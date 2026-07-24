#!/usr/bin/env node
/**
 * Быстрая проверка SMTP с .env.production
 * На VPS: node scripts/smtp-ping.js
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env.production');
if (!fs.existsSync(envPath)) {
  console.error('FAIL: нет файла', envPath);
  process.exit(1);
}

for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 0) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if (
    (v.startsWith("'") && v.endsWith("'")) ||
    (v.startsWith('"') && v.endsWith('"'))
  ) {
    v = v.slice(1, -1);
  }
  if (process.env[k] === undefined) process.env[k] = v;
}

const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];
for (const k of keys) {
  const raw = process.env[k];
  const ok = Boolean(raw && String(raw).trim());
  if (k === 'SMTP_PASSWORD') {
    console.log(k + ':', ok ? 'set(len=' + String(raw).length + ')' : 'MISSING');
  } else {
    console.log(k + ':', ok ? String(raw) : 'MISSING');
  }
}

if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
  console.error('FAIL: не хватает SMTP_* в .env.production');
  process.exit(1);
}

const nodemailer = require('nodemailer');
const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
});

t.verify()
  .then(() => {
    console.log('SMTP OK', process.env.SMTP_HOST, process.env.SMTP_USER);
  })
  .catch((e) => {
    console.error('SMTP REAL FAIL', e.message);
    process.exit(1);
  });
