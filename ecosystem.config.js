module.exports = {
  apps: [{
    name: 'yana_app',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: '/var/www/yana_app',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      NODE_OPTIONS: '--max-old-space-size=8192' // Увеличено до 8GB для больших файлов
    },
    error_file: '/var/www/yana_app/logs/pm2-error.log',
    out_file: '/var/www/yana_app/logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    // Автоматический перезапуск при изменении файлов (опционально, для разработки)
    ignore_watch: [
      'node_modules',
      '.next',
      '.git',
      'logs',
      '*.log'
    ]
  }]
};
