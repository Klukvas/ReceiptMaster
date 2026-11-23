# Production release

Last Updated: 2026-11-23

A trusted push to `main` runs verification, then publishes the frontend and backend
Docker Hub images under the same full commit SHA. Pull requests cannot publish or deploy.
Verification includes CI's `test-release-gate` job, which runs
`python3 scripts/deploy-production.test.py` on every pull request and push. It drives this
script against fake Docker plus real `docker compose config` rendering and never contacts
production. A failure there stops image publication and therefore deployment.
Payments follow the repository variable `BILLING_ENABLED`. Unless it is exactly `true`, the
release sets `BILLING_ENABLED=false` on the backend and builds the frontend image with
`VITE_BILLING_ENABLED=false`, and Creem secrets are not required. Plan records and quota
enforcement are active either way. See *Enabling payments* below.

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
   the billing flag (with the Creem keys as placeholders when it is on), `AUTO_RUN_MIGRATIONS=false`, the public `FRONTEND_URL`, the one-shot
   `migrate` service and the `postgres`/`db-backup` credential mapping. Credentials stay
   `${...}` placeholders, never values. The backend refuses to start in production without
   that origin, so public receipt links cannot silently point at localhost.
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
   Redis/storage health, the billing capability the release asked for, public TLS frontend and JS asset,
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

**Plan limits ship with billing.** The same release tightens the free plan for every account
(one template, three document types, no logo, analytics or suppliers). Do not deploy it with
`BILLING_ENABLED=false`: users would meet limits they cannot pay to lift.
`AddReceiptContentPurgedAt1794200000000` is additive.

**Exception: the Creem release.** `ReplaceBillingProviderColumns1794100000000` drops the
previous billing provider's columns from `user_subscriptions`, so it is not additive. The
automatic rollback restores images that select those columns: subscription reads, and with
them order and product creation, fail until the migration is reverted by hand
(`migration:revert`, which re-creates the columns empty). Treat a failed deploy of this
release as needing that manual step.

The script reports the application's database role from the backend's own connection: its
name, superuser and bypass flags, and how many objects it owns. An owner or superuser
bypasses RLS. Until `REQUIRE_RESTRICTED_APP_ROLE` is set this is a warning; afterwards it
blocks the release. The script never provisions roles; `backend/db/roles/README.md` is the
operator runbook, and integration tests cover the scripts it uses.

## Enabling payments

1. On the production host add `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`,
   `CREEM_PRO_PRODUCT_ID` and `CREEM_BUSINESS_PRODUCT_ID` (live values) to the environment
   file the stack already uses. Nothing restarts: the running configuration does not read them.
2. In the Creem dashboard (live mode) point the webhook at `https://<host>/creem/webhook`.
3. Set the repository variable `BILLING_ENABLED` to `true`.
4. Push to `main`.

The release then builds the frontend with billing on, and the override sets
`BILLING_ENABLED=true`, `CREEM_ENVIRONMENT=production` and maps the four keys from the
server's environment file. The precheck stops before any change if a key is missing or
empty, naming the key and never its value. The release passes only if the public API and
`release.json` both report billing on; otherwise it rolls back. Removing the variable and
releasing again turns payments off. The frontend needs no provider key: checkout and the billing
portal are Creem-hosted pages the backend returns links to. Keep secrets out of chat and
source control. The frontend also requires the server capability to be enabled before it
shows any purchase surface.
