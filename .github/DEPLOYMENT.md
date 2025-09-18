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

### Container Registry
- `GHCR_TOKEN` - GitHub Container Registry token
- `GHCR_USERNAME` - GitHub Container Registry username

## Deployment Process

### **Automatic Deployment (CI/CD)**
- **Trigger**: Push to `main` branch
- **What deploys**: Only application (frontend + backend)
- **Database**: Assumed to be already running
- **Workflow**: `ci.yml` → `deploy-application.yml`

### **Manual Database Deployment**
- **When to use**:
  - Initial setup
  - Database configuration changes
  - PostgreSQL version updates
  - Recovery after database failure
- **Workflow**: `deploy-database.yml` (manual trigger)

### **Manual Application Deployment**
- **When to use**:
  - Quick app updates without full CI/CD
  - Testing specific changes
  - Emergency deployments
- **Workflow**: `deploy-application.yml` (manual trigger)

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

If automated deployment fails, you can deploy manually:

```bash
# Deploy database
./scripts/deploy-db.sh <DB_SERVER_IP>

# Deploy application
DB_HOST=<DB_PRIVATE_IP> ./scripts/deploy-app.sh <APP_SERVER_IP>
```
