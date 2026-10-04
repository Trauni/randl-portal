require('dotenv').config({ path: '/home/radmin/web/randlweb.de/public_html/portal/.env' });

module.exports = {
  apps: [{
    name: 'randlweb-portal',
    script: 'server.js',
    cwd: '/home/radmin/web/randlweb.de/public_html/portal',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    error_file: '/home/radmin/logs/portal-error.log',
    out_file: '/home/radmin/logs/portal-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    env: {
      NODE_ENV: 'production',
      ...require('dotenv').config({ path: '/home/radmin/web/randlweb.de/public_html/portal/.env' }).parsed
    }
  }]
}
