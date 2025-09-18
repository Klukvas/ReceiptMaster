# Deployment Configuration for Two-Server Architecture

This document describes the required GitHub Secrets for the new two-server deployment architecture.

## Required GitHub Secrets

### Server Configuration
- `APP_HOST` - Public IP of the application server (e.g., `116.203.176.71`)
- `DB_HOST` - Public IP of the database server (e.g., `91.98.172.0`)
- `DB_PRIVATE_IP` - Private IP of the database server (e.g., `10.0.1.20`)
- `SSH_USER` - SSH username (usually `root`)
- `SSH_KEY` - Private SSH key for server access

### Database Configuration
- `DB_NAME` - Database name (e.g., `market_db`)
- `DB_USERNAME` - Database username (e.g., `postgres`)
- `DB_PASSWORD` - Database password
- `DB_PORT` - Database port (e.g., `5432`)
- `PGADMIN_EMAIL` - PgAdmin login email
- `PGADMIN_PASSWORD` - PgAdmin login password

### Application Configuration
- `API_KEY` - API authentication key
- `JWT_SECRET` - JWT secret (minimum 32 characters)
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `RECEIPT_BASE_URL` - Base URL for receipts (e.g., `http://116.203.176.71:3000`)

### Frontend Configuration
- `VITE_API_URL` - Frontend API URL (e.g., `http://116.203.176.71:3000/api/v1`)
- `VITE_API_KEY` - Frontend API key
- `FRONTEND_API_URL` - Frontend API URL for Docker build (e.g., `http://116.203.176.71:3000/api/v1`)
- `FRONTEND_API_KEY` - Frontend API key for Docker build

### Container Registry
- `DOCKERHUB_TOKEN` - Docker Hub access token
- `DOCKERHUB_USERNAME` - Docker Hub username

## Setting Up GitHub Secrets

To set up all required secrets, run the following commands in your project directory:

```bash
# Server Configuration
gh secret set APP_HOST --body "116.203.176.71"
gh secret set DB_HOST --body "91.98.172.0"
gh secret set DB_PRIVATE_IP --body "10.0.1.20"
gh secret set SSH_USER --body "root"
gh secret set SSH_KEY --body "$(cat ~/.ssh/id_rsa)"

# Database Configuration
gh secret set DB_NAME --body "market_db"
gh secret set DB_USERNAME --body "postgres"
gh secret set DB_PASSWORD --body "your-secure-password"
gh secret set DB_PORT --body "5432"
gh secret set PGADMIN_EMAIL --body "admin@market.com"
gh secret set PGADMIN_PASSWORD --body "your-pgadmin-password"

# Application Configuration
gh secret set API_KEY --body "your-secure-api-key"
gh secret set JWT_SECRET --body "your-super-secret-jwt-key-that-is-at-least-32-characters-long"
gh secret set TELEGRAM_BOT_TOKEN --body "your-telegram-bot-token"
gh secret set RECEIPT_BASE_URL --body "http://116.203.176.71:3000"

# Frontend Configuration
gh secret set VITE_API_URL --body "http://116.203.176.71:3000/api/v1"
gh secret set VITE_API_KEY --body "your-secure-api-key"
gh secret set FRONTEND_API_URL --body "http://116.203.176.71:3000/api/v1"
gh secret set FRONTEND_API_KEY --body "your-secure-api-key"

# Docker Hub
gh secret set DOCKERHUB_TOKEN --body "your-dockerhub-token"
gh secret set DOCKERHUB_USERNAME --body "your-dockerhub-username"
```

**Important Notes:**
- Replace placeholder values with your actual secrets
- JWT_SECRET must be at least 32 characters long
- Use strong, unique passwords for all secrets
- Keep your SSH private key secure

## Deployment Process

### **Automatic Deployment (CI/CD)**
- **Trigger**: Push to `main` branch
- **What deploys**: Application (frontend + backend)
- **Database**: Assumed to be already running
- **Workflow**: `ci.yml`

### **Manual Database Deployment**
- **When to use**:
  - Initial setup
  - Database configuration changes
  - PostgreSQL version updates
  - Recovery after database failure
- **Workflow**: `deploy-database.yml` (manual trigger)

### **Deployment Steps**

1. **Database Server** (one-time setup):
   - Clones repository to `/opt/market/database`
   - Deploys PostgreSQL and PgAdmin containers
   - Uses `docker-compose.database.yml` configuration

2. **Application Server** (every push):
   - Clones repository to `/opt/market/market`
   - Deploys frontend and backend containers
   - Uses `docker-compose.application.yml` configuration
   - Connects to database via private network

## Network Architecture

```
Internet
    │
    ├── App Server (116.203.176.71)
    │   ├── Frontend (Port 80)
    │   └── Backend (Port 3000)
    │
    └── Private Network (10.0.1.0/24)
        │
        └── DB Server (91.98.172.0)
            ├── PostgreSQL (Port 5432)
            └── PgAdmin (Port 5050)
```

## Security Notes

- Database server is only accessible from the application server via private network
- SSH access is required for both servers
- All sensitive data is stored in GitHub Secrets
- Database credentials are not exposed in public repositories

## Troubleshooting

### Common Issues

1. **Database Connection Failed**:
   - Check `DB_PRIVATE_IP` secret
   - Verify private network connectivity
   - Check firewall rules

2. **Application Won't Start**:
   - Verify all required secrets are set
   - Check JWT_SECRET length (minimum 32 characters)
   - Review application logs

3. **Deployment Timeout**:
   - Check server resources
   - Verify container registry access
   - Review network connectivity

### Manual Deployment

If automated deployment fails, you can deploy manually using GitHub Actions:

1. **Deploy Database**: Go to Actions → "Deploy Database Server" → "Run workflow"
2. **Deploy Application**: Push to `main` branch or manually trigger the CI workflow

Alternatively, you can deploy locally:

```bash
# Deploy application locally
docker compose -f docker-compose.application.yml up -d
```
