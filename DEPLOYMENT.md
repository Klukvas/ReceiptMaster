# 🚀 Deployment Guide

This guide explains how to set up automated CI/CD for MarketFlow using GitHub Actions and GitHub Container Registry.

## Quick Setup

### 1. Push to GitHub
```bash
# Initialize git repository (if not already done)
git init
git add .
git commit -m "Initial commit with CI/CD setup"

# Add your GitHub repository as remote
git remote add origin https://github.com/your-username/your-repo.git
git branch -M main
git push -u origin main
```

### 2. Enable GitHub Actions
1. Go to your repository on GitHub
2. Navigate to **Settings** → **Actions** → **General**
3. Under **Workflow permissions**, select:
   - ✅ **Read and write permissions**
   - ✅ **Allow GitHub Actions to create and approve pull requests**

### 3. Configure Package Registry
1. Go to your repository's **Packages** section
2. Set package visibility to **Public** or **Private** as needed
3. Configure access permissions for your team

## Workflows Overview

### 🔄 Automatic Triggers

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **Test** | PR to main, Push to main | Run tests, linting, build validation |
| **Build & Deploy** | PR to main, Push to main | Build and push Docker images with smart tagging |

### 📦 Generated Images

After pushing to main, these images will be available:

```bash
# Production images (latest)
ghcr.io/your-username/your-repo/frontend:latest
ghcr.io/your-username/your-repo/backend:latest

# Specific commit images
ghcr.io/your-username/your-repo/frontend:abc1234
ghcr.io/your-username/your-repo/backend:abc1234
```

## Local Development

### Using Production Images
```bash
# Set your repository name
export GITHUB_REPOSITORY=your-username/your-repo

# Copy environment template
cp env.prod.example .env.prod

# Edit environment variables
nano .env.prod

# Deploy using production images
./deploy.sh -r your-username/your-repo
```

### Using Local Development
```bash
# Start development environment
yarn docker:up

# Run migrations
yarn backend:migration:run
```

## Production Deployment

### 1. Prepare Environment
```bash
# Copy environment template
cp env.prod.example .env.prod

# Edit with your production values
nano .env.prod
```

### 2. Deploy
```bash
# Deploy with your repository
./deploy.sh -r your-username/your-repo

# Or with custom environment file
./deploy.sh -r your-username/your-repo -e .env.production
```

### 3. Verify Deployment
```bash
# Check service status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Test endpoints
curl http://localhost:3000/api/v1/health
curl http://localhost:80
```

## Environment Variables

### Required Variables
```bash
# GitHub Repository
GITHUB_REPOSITORY=your-username/your-repo

# Database
DB_USERNAME=postgres
DB_PASSWORD=your-secure-password
DB_NAME=market_db

# API Security
API_KEY=your-production-api-key
VITE_API_KEY=your-production-api-key

# Frontend
VITE_API_URL=http://localhost:3000/api/v1
RECEIPT_BASE_URL=http://localhost:3000
```

### Optional Variables
```bash
# pgAdmin
PGADMIN_EMAIL=admin@yourdomain.com
PGADMIN_PASSWORD=your-pgadmin-password
```

## Monitoring

### GitHub Actions
- Go to **Actions** tab in your repository
- Monitor workflow runs and build status
- Check build logs for any issues

### Container Registry
- Go to **Packages** section in your repository
- View published images and their tags
- Monitor image pull statistics

### Application Health
- **Frontend**: http://localhost:80
- **Backend API**: http://localhost:3000/api/v1
- **API Docs**: http://localhost:3000/api/v1/docs
- **pgAdmin**: http://localhost:5050

## Troubleshooting

### Common Issues

1. **Permission Denied**
   ```bash
   # Ensure workflow permissions are enabled
   # Check that GITHUB_TOKEN has necessary permissions
   ```

2. **Docker Build Fails**
   ```bash
   # Check Dockerfile syntax
   # Verify all dependencies are included
   # Review build context and file paths
   ```

3. **Registry Push Fails**
   ```bash
   # Verify package visibility settings
   # Check repository permissions
   # Ensure GITHUB_TOKEN is valid
   ```

4. **Deployment Fails**
   ```bash
   # Check environment variables
   # Verify Docker images exist
   # Review container logs
   ```

### Debug Commands
```bash
# Test Docker builds locally
docker build -t marketflow-frontend:test ./frontend
docker build -t marketflow-backend:test ./backend

# Test image functionality
docker run --rm -p 3000:3000 marketflow-backend:test
docker run --rm -p 5173:5173 marketflow-frontend:test

# Check GitHub Container Registry access
docker pull ghcr.io/your-username/your-repo/frontend:latest
```

## Security Considerations

1. **API Keys**: Use strong, unique API keys for production
2. **Database Passwords**: Use complex passwords and consider external secret management
3. **Package Visibility**: Set appropriate visibility for your Docker images
4. **Access Control**: Configure team permissions for the repository and packages

## Next Steps

1. **Monitoring**: Set up application monitoring and alerting
2. **Backups**: Configure database backups
3. **SSL/TLS**: Set up HTTPS with reverse proxy (nginx/traefik)
4. **Scaling**: Consider horizontal scaling with load balancers
5. **Updates**: Set up automated updates and rollback procedures
