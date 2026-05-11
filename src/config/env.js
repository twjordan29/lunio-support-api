require('dotenv').config();

const requiredEnvVars = [
  'APP_NAME',
  'NODE_ENV',
  'PORT',
  'DB_HOST',
  'DB_PORT',
  'DB_DATABASE',
  'DB_USERNAME',
  'DB_PASSWORD',
  'CHAT_TOKEN_SECRET',
  'LUNIO_APP_URL',
  'CORS_ORIGIN'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

module.exports = {
  appName: process.env.APP_NAME,
  nodeEnv: process.env.NODE_ENV,
  port: parseInt(process.env.PORT, 10),
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_DATABASE,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD
  },
  chatTokenSecret: process.env.CHAT_TOKEN_SECRET,
  lunioAppUrl: process.env.LUNIO_APP_URL,
  corsOrigin: process.env.CORS_ORIGIN.split(',').map(o => o.trim())
};