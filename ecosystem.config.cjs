module.exports = {
  apps: [
    {
      name: 'smartaudit-backend',
      script: 'npm',
      args: 'run dev',
      cwd: '/home/ubuntu',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 8080
      },
      error_file: '/home/ubuntu/logs/backend-error.log',
      out_file: '/home/ubuntu/logs/backend-out.log',
      log_file: '/home/ubuntu/logs/backend-combined.log',
      time: true
    }
  ]
};
