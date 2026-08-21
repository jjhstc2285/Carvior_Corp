// pm2 설정 — EC2에서 `pm2 start ecosystem.config.js` 로 띄운다.
module.exports = {
  apps: [
    {
      name: 'anyone-api',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      time: true,
    },
  ],
};
