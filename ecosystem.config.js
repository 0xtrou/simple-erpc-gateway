module.exports = {
  apps: [{
    name: 'simple-erpc-gateway',
    script: './dist/server.js',
    instances: 1,
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 1099
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 1099
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    time: true,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 4000,
    min_uptime: '10s',
    kill_timeout: 5000,
    listen_timeout: 3000,
    shutdown_with_message: true,
    wait_ready: true,
    // Health monitoring
    health_check_url: 'http://localhost:1099/health',
    health_check_grace_period: 3000,
    // Advanced PM2 features
    source_map_support: false,
    instance_var: 'INSTANCE_ID',
    // Resource monitoring
    monitoring: true,
    pmx: true
  }]
};