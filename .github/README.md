# GitHub Actions Workflow

This directory contains the GitHub Actions workflow for the ReceiptMaster project.

**Every push to `main`, including a merged pull request, deploys production.**

- [PROJECT.md](../PROJECT.md#cicd-github-actions) lists the jobs in `ci.yml`.
- [DEPLOYMENT.md](DEPLOYMENT.md) describes the guarded production release.

## Workflow

### `ci.yml` - Test, Build, and Deploy
- **Triggers:** Pull requests to main, pushes to main
- **Purpose:** Run the verification jobs, then publish images and deploy production
- **Behavior:**
  - **On PR:** Runs only the verification jobs. A new push cancels the PR's run in progress.
  - **On main push:** Runs the verification jobs. If they all pass, `build-and-deploy` publishes the images and `deploy-production` releases them.

PostgreSQL runs on the production server in the application's Compose project. No workflow deploys it, and a release only backs it up and migrates it.

## Docker Images

`build-and-deploy` pushes both images to Docker Hub under the full commit SHA:

- `{DOCKERHUB_USERNAME}/receiptmaster-frontend:{sha}`
- `{DOCKERHUB_USERNAME}/receiptmaster-backend:{sha}`

These SHA tags are the only tags CI publishes, and pull requests never build or push images. CI no longer updates the `latest` tag on Docker Hub, so it points at an old image.

## Setup Instructions

### Repository Secrets
Set these under Settings → Secrets and variables → Actions:

| Secret | Purpose |
|---|---|
| `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` | Docker Hub login and image namespace |
| `SSH_USER`, `SSH_KEY` | SSH access to the production server |
| `APP_HOST` | Production server |
| `FRONTEND_API_URL`, `FRONTEND_API_KEY` | Frontend image build arguments |

Database credentials are not GitHub secrets. They live in the server's `.env`, which a release never rewrites.

## Usage

### For Pull Requests
- All verification jobs run automatically
- Nothing is published or deployed

### For Main Branch Pushes
- All verification jobs run
- Docker images are built and pushed with the commit SHA
- Those images are deployed to production

### Retrying a Failed Release
`ci.yml` has no manual trigger. To retry a failed release, re-run its failed jobs:

```bash
gh run rerun <run-id> --failed
```

## Monitoring

- Check the "Actions" tab for workflow status
- View build logs for debugging
- `build-and-deploy` reports the published images, and `deploy-production` reports the release
- Set up notifications for failed builds

## Troubleshooting

### Common Issues

1. **Docker Hub Login or Push Fails**
   - Verify `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`
   - Ensure the token can push to both image repositories

2. **Docker Build Fails**
   - Verify Dockerfile syntax
   - Check for missing dependencies
   - Review build context and file paths

3. **Release Blocked**
   - `deploy-production` prints `RELEASE BLOCKED:` with the reason
   - The precheck is read-only, so after a failure there fix the cause and re-run the failed jobs
   - See [DEPLOYMENT.md](DEPLOYMENT.md) for the full sequence and rollback behavior

### Debug Commands

```bash
# Test Docker builds locally
docker build -t receiptmaster-frontend:test ./frontend
docker build -t receiptmaster-backend:test -f backend/Dockerfile.playwright ./backend
```

Neither image runs alone. The frontend's nginx needs a `backend` host at startup, and the backend needs its environment, PostgreSQL and Redis.
