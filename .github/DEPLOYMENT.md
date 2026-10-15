# Production release

Last Updated: 2026-10-15

A trusted push to `main` runs verification, then publishes the frontend and backend
Docker Hub images under the same full commit SHA. Pull requests cannot publish or deploy.
The current release deliberately has payments disabled: `BILLING_ENABLED=false` on the
backend and `VITE_BILLING_ENABLED=false` in the frontend image. Paddle secrets are not
required for this release. Existing plan records and quota enforcement remain active.

The workflow uses the existing trusted `APP_HOST`, `SSH_USER`, `SSH_KEY` and Docker Hub
configuration. It does not rewrite production `.env`, reset a repository, prune images,
remove orphan containers, or update PostgreSQL/Redis. Registry pull access must already
be available on the production host. Ambiguous container/project/configuration state
blocks deployment; it is not repaired automatically.

## Guarded sequence

1. A read-only precheck discovers exactly one running backend/frontend/PostgreSQL/Redis
   pair in the same Compose project. It verifies existing configuration paths, working
   directory, recorded environment-file availability, retained image IDs, effective versus running
   environments for both apps, actual runtime/backup database fingerprint equality, migration history, dump tools, disk space and baseline TLS health.
   Only the expected new `ReceiptCapabilitiesAndOutbox1792000000000` may be pending.
2. CI transfers only the release script, production Compose reference and SHA marker to
   a unique `/opt/market/releases/<sha>-<run>-<attempt>` directory. It verifies the archive
   checksum and exact file allowlist. Existing application files are preserved.
3. The script takes a host lock, repeats discovery, captures actual old image IDs and
   retains local rollback tags. It pulls and checks both new image SHA labels. Existing
   Compose files remain the base; a release-local override supplies only the two images,
   disabled billing and `AUTO_RUN_MIGRATIONS=false`.
4. It verifies the new image's exact migration set. It stops the old backend for a short
   maintenance period, then takes a custom-format `pg_dump` directly from the existing
   PostgreSQL container. The host backup has mode 0600. Both the archive list and full
   payload are parsed with `pg_restore`; a SHA256 accompanies the final backup outside
   the release directory. This does not perform a production restore or contact S3.
5. A one-shot new image runs only the additive migration UP, holding the application's
   PostgreSQL advisory lock. The one-off uses the validated Compose environment and
   confirms the backup database fingerprint before any migration. Every pool connection
   has bounded lock/statement timeouts. Failed commands stop the uniquely named migration
   container and confirm termination before rollback; unknown completion requires manual
   intervention. It checks the new operational tables' permissions. No
   automatic DOWN, role provisioning or data cleanup occurs.
6. Only backend and frontend are recreated, with `--no-deps --no-build --pull never`.
   The frontend is recreated to refresh nginx's backend DNS. Success requires API DB/
   Redis/storage health, billing capability false, public TLS frontend and JS asset,
   cache-busted `release.json` matching the SHA, and running image identities.

An application/health failure after maintenance recreates both applications from the
captured old image IDs using the original configuration. Rollback success also requires bounded API/dependency health, public TLS root/JS and
the captured old image identities. A failed recovery is reported explicitly while preserving
the original release error. Public probes reject redirects and require the same HTTPS
origin throughout. The release still fails. The
additive database migration and verified backup remain; never automatically run a DOWN
migration. A real restore requires a separately reviewed operation. Backup validation
proves archive readability, not a completed restore rehearsal.

The script reports the existing database role's superuser/bypass flags. An existing
owner/superuser may bypass RLS; this release does not provision or claim a restricted
production role. Nonowner RLS behavior is separately covered by integration tests.

## Enabling payments later

This requires an explicit configuration/release change. Set strict backend/frontend flags
to true, securely configure backend `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`,
`PADDLE_PRO_PRICE_ID`, `PADDLE_BUSINESS_PRICE_ID`, `FRONTEND_URL`, and explicitly
`PADDLE_ENVIRONMENT=production`. Supply the public frontend client token and explicit
production environment during its image build. Keep secrets out of chat and source control.
The frontend also requires the server capability to be enabled before initializing Paddle.
