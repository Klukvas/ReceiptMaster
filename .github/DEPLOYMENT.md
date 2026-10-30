# Production release

Last Updated: 2026-10-30

A trusted push to `main` runs verification, then publishes the frontend and backend
Docker Hub images under the same full commit SHA. Pull requests cannot publish or deploy.
The current release deliberately has payments disabled: `BILLING_ENABLED=false` on the
backend and `VITE_BILLING_ENABLED=false` in the frontend image. Paddle secrets are not
required for this release. Existing plan records and quota enforcement remain active.

The workflow uses the existing trusted `APP_HOST`, `SSH_USER`, `SSH_KEY` and Docker Hub
configuration. It does not rewrite production `.env`, reset a repository, remove orphan
containers, or update PostgreSQL/Redis. Registry pull access must already be available on
the production host. Ambiguous container/project/configuration state blocks deployment; it
is not repaired automatically.

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
   Compose files remain the base; a release-local override supplies the two images,
   disabled billing, `AUTO_RUN_MIGRATIONS=false`, the one-shot `migrate` service and the
   `postgres`/`db-backup` credential mapping. It holds `${...}` placeholders, never values.
   The `docker-compose.production.yml` in the bundle is a reference and is not applied.
4. It verifies the new image's exact migration set. It stops the old backend for a short
   maintenance period, then takes a custom-format `pg_dump` directly from the existing
   PostgreSQL container. The host backup has mode 0600. Both the archive list and full
   payload are parsed with `pg_restore`; a SHA256 accompanies the final backup outside
   the release directory. This does not perform a production restore or contact S3.
5. A one-shot new image runs only the additive migration UP, holding the application's
   PostgreSQL advisory lock. The one-off runs as `DB_OWNER_USERNAME` when set, otherwise as
   the runtime role, and owner credentials never enter the backend container. It confirms
   the backup database fingerprint before any migration. Every pool connection
   has bounded lock/statement timeouts. Failed commands stop the uniquely named migration
   container and confirm termination before rollback; unknown completion requires manual
   intervention. Before and after applying, it checks that the runtime role can use every
   table and sequence. No automatic DOWN, role provisioning or data cleanup occurs.
6. Only backend and frontend are recreated, with `--no-deps --no-build --pull never`.
   The frontend is recreated to refresh nginx's backend DNS. Success requires API DB/
   Redis/storage health, billing capability false, public TLS frontend and JS asset,
   cache-busted `release.json` matching the SHA, and running image identities.
7. Only after that success, still under the host lock, it removes old application images. The
   last three released pairs and the captured old pair stay, with all of their tags. Removal is
   `docker rmi` without force on exact application release and rollback tags, so `postgres`,
   `redis` and `market-db-backup` are out of reach. A cleanup failure or the two-minute limit
   only prints a warning: the release stays complete and the next verified release retries.
   A server already below the precheck's free-space floor never reaches this step, so it
   needs one manual `docker rmi` of old tags first. Release directories are kept because
   each new release still lists every earlier override.

An application/health failure after maintenance recreates both applications from the
captured old image IDs using the original configuration. Rollback success also requires bounded API/dependency health, public TLS root/JS and
the captured old image identities. A failed recovery is reported explicitly while preserving
the original release error. Public probes reject redirects and require the same HTTPS
origin throughout. The release still fails. The
additive database migration and verified backup remain; never automatically run a DOWN
migration. A real restore requires a separately reviewed operation. Backup validation
proves archive readability, not a completed restore rehearsal.

The script reports the application's database role from the backend's own connection: its
name, superuser and bypass flags, and how many objects it owns. An owner or superuser
bypasses RLS. Until `REQUIRE_RESTRICTED_APP_ROLE` is set this is a warning; afterwards it
blocks the release. The script never provisions roles; `backend/db/roles/README.md` is the
operator runbook, and integration tests cover the scripts it uses.

## Enabling payments later

This requires an explicit configuration/release change. Set strict backend/frontend flags
to true, securely configure backend `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`,
`PADDLE_PRO_PRICE_ID`, `PADDLE_BUSINESS_PRICE_ID`, `FRONTEND_URL`, and explicitly
`PADDLE_ENVIRONMENT=production`. Supply the public frontend client token and explicit
production environment during its image build. Keep secrets out of chat and source control.
The frontend also requires the server capability to be enabled before initializing Paddle.
