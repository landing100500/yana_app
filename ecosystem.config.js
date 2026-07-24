const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith("'") && val.endsWith("'")) ||
      (val.startsWith('"') && val.endsWith('"'))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const cwd = '/var/www/yana_app';
const fromProduction = loadEnvFile(path.join(cwd, '.env.production'));
const fromLocal = loadEnvFile(path.join(cwd, '.env.local'));
const fromDotEnv = loadEnvFile(path.join(cwd, '.env'));

// Порядок: base → production → local (local побеждает)
const fileEnv = { ...fromDotEnv, ...fromProduction, ...fromLocal };

module.exports = {
  apps: [
    {
      name: 'yana_app',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NODE_OPTIONS: '--max-old-space-size=8192',
        ...fileEnv,
      },
      error_file: '/var/www/yana_app/logs/pm2-error.log',
      out_file: '/var/www/yana_app/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      ignore_watch: ['node_modules', '.next', '.git', 'logs', '*.log'],
    },
  ],
};
