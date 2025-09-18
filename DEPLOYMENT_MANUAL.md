# Manual Deployment Guide

## 🚀 Quick Deploy Commands

### Deploy Database Server
```bash
# 1. Copy database configuration
scp docker-compose.database.yml root@91.98.172.0:/opt/market/database/docker-compose.yml
scp backend/init.sql root@91.98.172.0:/opt/market/database/

# 2. Setup environment
ssh root@91.98.172.0 "cd /opt/market/database && cat > .env << 'EOF'
DB_NAME=market_db
DB_USERNAME=postgres
DB_PASSWORD=postgres
PGADMIN_EMAIL=admin@market.com
PGADMIN_PASSWORD=admin
EOF"

# 3. Deploy
ssh root@91.98.172.0 "cd /opt/market/database && docker compose up -d"
```

### Deploy Application Server
```bash
# 1. Copy application configuration
scp docker-compose.application.yml root@116.203.176.71:/opt/market/market/docker-compose.yml

# 2. Setup environment
ssh root@116.203.176.71 "cd /opt/market/market && cat > .env << 'EOF'
# Database configuration
DB_HOST=10.0.1.20
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=market_db

# Application configuration
API_KEY=your-api-key
JWT_SECRET=your-super-secret-jwt-key-that-is-at-least-32-characters-long
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
RECEIPT_BASE_URL=http://116.203.176.71:3000

# Frontend configuration
VITE_API_URL=http://116.203.176.71:3000/api/v1
VITE_API_KEY=your-api-key

# Docker Hub
DOCKERHUB_USERNAME=klukvas
EOF"

# 3. Login to Docker Hub
ssh root@116.203.176.71 "echo 'your-dockerhub-token' | docker login -u klukvas --password-stdin"

# 4. Deploy
ssh root@116.203.176.71 "cd /opt/market/market && docker compose up -d"
```

## 🔧 Server Information

### App Server (116.203.176.71)
- **Frontend**: http://116.203.176.71
- **Backend API**: http://116.203.176.71:3000/api/v1
- **Private IP**: 10.0.1.10

### DB Server (91.98.172.0)
- **PostgreSQL**: 91.98.172.0:5432
- **PgAdmin**: http://91.98.172.0:5050
- **Private IP**: 10.0.1.20

## 📋 Required Secrets

Set these in GitHub Settings → Secrets and variables → Actions:

- `APP_HOST` = 116.203.176.71
- `DB_HOST` = 91.98.172.0
- `DB_PRIVATE_IP` = 10.0.1.20
- `SSH_USER` = root
- `SSH_KEY` = your SSH private key
- `DB_NAME` = market_db
- `DB_USERNAME` = postgres
- `DB_PASSWORD` = postgres
- `DB_PORT` = 5432
- `PGADMIN_EMAIL` = admin@market.com
- `PGADMIN_PASSWORD` = admin
- `API_KEY` = your-api-key
- `JWT_SECRET` = your-jwt-secret-min-32-chars
- `TELEGRAM_BOT_TOKEN` = your-telegram-bot-token
- `RECEIPT_BASE_URL` = http://116.203.176.71:3000
- `VITE_API_URL` = http://116.203.176.71:3000/api/v1
- `VITE_API_KEY` = your-api-key
- `FRONTEND_API_URL` = http://116.203.176.71:3000/api/v1
- `FRONTEND_API_KEY` = your-api-key
- `DOCKERHUB_TOKEN` = your-dockerhub-token
- `DOCKERHUB_USERNAME` = klukvas
