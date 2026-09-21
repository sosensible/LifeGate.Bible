// pm2 process for the dev server on port 3007, which the Cloudflare Tunnel points at.
// Runs outside the Claude app / VS Code so the site stays up when they restart.
//
//   pm2 start ecosystem.config.cjs   first run (then `pm2 save`)
//   pm2 restart lifegate             after nuxt.config or dependency changes
//   pm2 logs lifegate                live log
//   pm2 stop lifegate                free port 3007
module.exports = {
  apps: [
    {
      name: 'lifegate',
      cwd: __dirname,
      // nuxi directly rather than `npm run dev`, so pm2 signals the real process
      // and not an npm wrapper that can leave nuxi orphaned on port 3007.
      script: 'node_modules/@nuxt/cli/bin/nuxi.mjs',
      args: 'dev --host',
      // Nuxt already hot-reloads; pm2 file watching would restart on every save.
      watch: false,
      autorestart: true,
      // Back off on repeated failures instead of spinning.
      exp_backoff_restart_delay: 1000,
      max_restarts: 20,
      min_uptime: '30s',
      kill_timeout: 5000,
      time: true,
    },
  ],
}
