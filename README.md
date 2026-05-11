# Lunio Support API

A Node.js realtime support/chat API service for Lunio, a Canadian invoicing SaaS.

## What This Service Is

- A standalone Node.js API service providing realtime support chat functionality
- Uses WebSocket connections via Socket.IO for real-time communication
- Shares Lunio's existing MariaDB database for data access
- Provides health check endpoints for monitoring
- Production-ready foundation for support chat infrastructure

## What This Service Is NOT

- A complete Lunio frontend UI component
- A duplicate authentication system (relies on Lunio's existing auth)
- A separate user/account management system (Lunio remains the source of truth)
- A full chat implementation (only the API/WebSocket foundation)

## Prerequisites

- Node.js 18+
- MariaDB database (shared with Lunio)

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

```env
APP_NAME=Lunio Support API
NODE_ENV=development
PORT=3001
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=lunio
DB_USERNAME=your_db_username
DB_PASSWORD=your_db_password
CHAT_TOKEN_SECRET=your_secret_key_for_chat_tokens
LUNIO_APP_URL=https://lunio.ca
CORS_ORIGIN=https://lunio.ca
```

All environment variables are required. The service will not start without them.

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up your `.env` file (see Environment Variables section)

3. Start the development server:
   ```bash
   npm run dev
   ```

4. The server will start on the port specified in your `.env` file (default: 3001)

## API Endpoints

- `GET /health` - General service health check
- `GET /health/db` - Database connectivity health check

## WebSocket

The service accepts Socket.IO connections and emits a "connected" event upon successful connection.

## Production Deployment

This service is intended to be deployed alongside Lunio using:

- **Nginx** as reverse proxy
- **PM2** for process management

Example PM2 ecosystem file (`ecosystem.config.js`):

```javascript
module.exports = {
  apps: [{
    name: 'lunio-support-api',
    script: 'src/server.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      // ... other env vars
    }
  }]
};
```

Example Nginx configuration:

```
server {
    listen 80;
    server_name api.lunio.ca;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Architecture

```
src/
├── app.js           # Express app setup and middleware
├── server.js        # HTTP server and Socket.IO initialization
├── config/
│   ├── env.js       # Environment variable validation
│   └── database.js  # MariaDB connection pool
├── routes/
│   └── health.routes.js  # Health check endpoints
├── sockets/
│   └── index.js     # Socket.IO connection handlers
└── utils/
    └── logger.js    # Pino structured logging
```

## Security

- Uses Helmet for security headers
- CORS configured for Lunio domain only
- No hardcoded secrets
- Environment-based configuration