module.exports = {
  apps: [
    {
      name: 'telegram-bot',
      script: './dist/bot.js',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'express-api',
      script: './dist/api.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};