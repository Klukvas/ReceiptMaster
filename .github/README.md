# GitHub Actions Workflows

This directory contains GitHub Actions workflows for the MarketFlow project.

## Workflows

### 1. `test.yml` - Testing and Validation
- **Triggers:** Pull requests to main, pushes to main
- **Purpose:** Run tests, linting, and build validation
- **Jobs:**
  - `test-backend`: Run backend tests, linting, and build
  - `test-frontend`: Run frontend linting and build
  - `docker-build-test`: Build Docker images for testing (not pushed)

### 2. `build-and-deploy.yml` - Docker Build and Deploy
- **Triggers:** Pull requests to main, pushes to main
- **Purpose:** Build and push Docker images to GitHub Container Registry
- **Registry:** `ghcr.io`
- **Behavior:**
  - **On PR:** Builds and pushes images with commit SHA tag
  - **On main push:** Builds and pushes images with both SHA and `latest` tags
- **Images:**
  - `ghcr.io/{owner}/{repo}/frontend:{sha}` (always)
  - `ghcr.io/{owner}/{repo}/backend:{sha}` (always)
  - `ghcr.io/{owner}/{repo}/frontend:latest` (main branch only)
  - `ghcr.io/{owner}/{repo}/backend:latest` (main branch only)

## Setup Instructions

### 1. Enable GitHub Container Registry
1. Go to your repository settings
2. Navigate to "Actions" → "General"
3. Under "Workflow permissions", select "Read and write permissions"
4. Check "Allow GitHub Actions to create and approve pull requests"

### 2. Repository Secrets (if needed)
The workflows use `GITHUB_TOKEN` which is automatically provided by GitHub Actions. No additional secrets are required for basic functionality.

### 3. Package Visibility
1. Go to your repository's "Packages" section
2. Set package visibility to "Public" or "Private" as needed
3. Configure access permissions for your team

## Usage

### For Pull Requests
- All tests and builds run automatically
- Docker images are built and pushed for testing
- No production deployment occurs

### For Main Branch Pushes
- All tests and builds run
- Docker images are built and pushed with commit SHA
- Production images with `latest` tag are deployed

### Manual Workflow Triggers
You can manually trigger workflows from the GitHub Actions tab:
1. Go to "Actions" tab in your repository
2. Select the workflow you want to run
3. Click "Run workflow"

## Image Tags

- `latest`: Production images (main branch only)
- `{sha}`: Specific commit images
- `{branch}`: Branch-specific images
- `pr-{number}`: Pull request images

## Monitoring

- Check the "Actions" tab for workflow status
- View build logs for debugging
- Monitor package registry for image updates
- Set up notifications for failed builds

## Troubleshooting

### Common Issues

1. **Permission Denied**
   - Ensure workflow permissions are set correctly
   - Check that `GITHUB_TOKEN` has necessary permissions

2. **Docker Build Fails**
   - Verify Dockerfile syntax
   - Check for missing dependencies
   - Review build context and file paths

3. **Registry Push Fails**
   - Verify registry credentials
   - Check package visibility settings
   - Ensure repository has package write permissions

### Debug Commands

```bash
# Test Docker builds locally
docker build -t marketflow-frontend:test ./frontend
docker build -t marketflow-backend:test ./backend

# Test image functionality
docker run --rm -p 3000:3000 marketflow-backend:test
docker run --rm -p 5173:5173 marketflow-frontend:test
```
