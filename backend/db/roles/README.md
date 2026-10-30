# Production database roles

These scripts move production off the `postgres` superuser, so PostgreSQL RLS actually applies to
the application. Tests run the same files, so what CI proves is what an operator runs.

| Role | Purpose |
|---|---|
| `postgres` | Bootstrap superuser. Break-glass and the release gate's socket access only. |
| `rm_owner` | Owns the database objects. Runs migrations in a one-shot release container. Never in the backend's environment. |
| `rm_app` | Runtime role. No RLS bypass, owns nothing, `SELECT` only on `migrations`, append-only on `audit_logs`. Limited to 40 connections, so keep `DB_POOL_MAX` (default 20) well below that. |
| `rm_backup` | Read-only with `BYPASSRLS`, because `pg_dump` fails on RLS tables otherwise. |

| Script | Run as | Effect |
|---|---|---|
| `01-roles.sql` | superuser | Creates the roles, password-less, and re-asserts their flags |
| `02-ownership.sql` | superuser | Moves the database and every non-extension object to `rm_owner` |
| `03-grants.sql` | superuser or `rm_owner` | Grants and default privileges |
| `04-verify.sql` | superuser or `rm_owner` | Read-only. Raises on any drift, otherwise ends with a NOTICE |

All four are idempotent. Pass `-v ON_ERROR_STOP=1` to `psql`.

## Rollout

Start only after the commit carrying these scripts has been released: that release is what adds the
`migrate` service and the `db-backup` credential mapping to the running Compose chain.

Every step that writes to production needs the owner's explicit approval. Passwords and `.env` edits
are the owner's. Do not push to `main` while a stage runs. Keep a separate server session open with
`flock -n /opt/market/.receiptmaster-deploy.lock bash` for the whole stage, so a release cannot race
it; the lock ends when that shell exits.

The server's checkout is frozen and does not contain these files, so run the scripts from a laptop
checkout of the released commit. `PRODUCTION_SSH` is your SSH target for the server:

```bash
ssh "$PRODUCTION_SSH" \
  'docker exec -i marketflow-postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d market_db' \
  < backend/db/roles/01-roles.sql
```

Never replace `/opt/market/market/docker-compose.production.yml` with the repo's copy. It needs
`IMAGE_TAG`, which the server's `.env` does not set, and it changes the backend's environment, so the
release gate would block. Role separation reaches the server through the generated
`release.override.json`. Never delete a `/opt/market/releases/*` directory either: the running
containers' Compose file chain points at them.

Commands that recreate a container must reuse that chain:

```bash
files=$(docker inspect marketflow-backend --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}')
args="--project-name market --project-directory /opt/market/market --env-file /opt/market/market/.env"
for file in $(echo "$files" | tr ',' ' '); do args="$args -f $file"; done
```

### Stage 2: prepare the database while the app stays on `postgres`

A superuser ignores ownership and grants, so the app keeps working throughout. Run steps in order:
the gate uses `rm_owner` as soon as `.env` names it, so that role must already own everything.

1. Take a verified custom-format dump, the way the release gate does.
2. Run `01-roles.sql`.
3. Set the passwords interactively, so plaintext reaches neither logs nor process lists:
   `docker exec -it marketflow-postgres psql -U postgres -d market_db`, then `\password rm_owner`,
   `\password rm_app` and `\password rm_backup`.
4. Run `02-ownership.sql`, `03-grants.sql` and `04-verify.sql`. `02-ownership.sql` briefly takes
   exclusive table locks, so expect short stalls. If it fails with `canceling statement due to lock
   timeout`, nothing changed; run it again.
5. Add `DB_OWNER_USERNAME`, `DB_OWNER_PASSWORD`, `DB_BACKUP_USERNAME` and `DB_BACKUP_PASSWORD` to
   `/opt/market/market/.env`, and `chmod 600` it.
6. Recreate the backup container, then run one backup by hand and confirm the file reached S3 and
   decompresses:
   `docker compose $args up -d --no-deps --no-build --pull never --force-recreate db-backup`, then
   `docker exec marketflow-db-backup /scripts/backup-db.sh`. Until the script's retention fix ships,
   it exits non-zero after the upload, so judge it by the S3 object.
7. Push a no-op release, then confirm the migration role. A mistyped key falls back to `DB_USERNAME`
   without any error, so check it; this must print `rm_owner`. Rebuild `$args` first, because the
   release added a file to the chain:

   ```bash
   docker compose $args --profile release-migrate config --format json \
     | python3 -c "import json,sys; print(json.load(sys.stdin)['services']['migrate']['environment']['DB_USERNAME'])"
   ```

Rollback: run `02-ownership.sql` with every `rm_owner` replaced by `postgres`, remove the new `.env`
keys, and recreate `db-backup`. The roles can stay, since nothing uses them.

### Stage 3: move the app to `rm_app`

1. Run `04-verify.sql` again and stop if it fails. A migration applied as the wrong role since Stage 2
   would otherwise surface only as `permission denied` after the switch.
2. Keep a copy of `.env` with mode `600`.
3. Set `DB_USERNAME=rm_app`, its password, and `AUTO_RUN_MIGRATIONS=false`.
4. `docker compose $args up -d --no-deps --no-build --pull never --force-recreate backend`.
5. Confirm the backend's connection is restricted:

   ```bash
   docker exec marketflow-backend node -e "const {Client}=require('pg');const c=new Client({host:process.env.DB_HOST,user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});c.connect().then(()=>c.query(\"SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user\")).then(r=>{console.log(r.rows[0]);return c.end()})"
   ```

6. Check `/api/v1/health`, then login, the order list, receipt generation and a public link on the
   demo account. Watch the logs for `permission denied` and `row-level security`.

Rollback: restore the `.env` copy and repeat step 4. Nothing else needs undoing, because `postgres`
stays valid and rows written meanwhile are ordinary rows.

### Stage 4: lock it in

After 24 clean hours, set `REQUIRE_RESTRICTED_APP_ROLE = True` in `scripts/deploy-production.sh` in a
reviewed commit. From then on the gate blocks a release if the app is a superuser, has `BYPASSRLS`,
can create roles or databases, or owns a table, sequence, type or routine in `public`.

After 7 clean days, rotate the `postgres` password. The gate does not need it, because it connects
over the container socket with `local trust`.

## Restoring a backup

S3 dumps use `--no-owner --no-privileges`, so they carry no grants. Roles live at cluster level and
are not in a dump either: on a new cluster, run `01-roles.sql` and set passwords first.

Restore into a fresh database owned by `rm_owner`, as `rm_owner`, from a laptop checkout:

```bash
ssh "$PRODUCTION_SSH" \
  "docker exec -i marketflow-postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'CREATE DATABASE market_db_restored OWNER rm_owner'"
gunzip -c backup_YYYYMMDD_HHMMSS.sql.gz | ssh "$PRODUCTION_SSH" \
  'docker exec -i marketflow-postgres psql -X -v ON_ERROR_STOP=1 -U rm_owner -d market_db_restored'
```

Then pipe `03-grants.sql` and `04-verify.sql` into the same `psql`. Swapping the restored database in
for `market_db` is a separately reviewed operation. `backend/scripts/restore-db.sh` predates this
layout: it replays into the live database and connects with `DB_USERNAME`, so do not use it here.

## Writing migrations

- Migrations run as `rm_owner`, which has no `BYPASSRLS`. On FORCE RLS tables (`document_assets`,
  `document_presets`, `document_artifacts`) an owner sees no rows, and `UPDATE` reports zero rows
  without an error. A backfill there needs a transaction-local `TO CURRENT_USER` policy; see
  `1792100000002-DocumentUploadFencing.ts`.
- New tables and sequences reach `rm_app` through default privileges only when `rm_owner` creates
  them. The release gate blocks if any table or sequence lacks the runtime grants.
- A new table with special runtime rules, like `migrations` or `audit_logs`, needs matching changes in
  `03-grants.sql`, `04-verify.sql` and the gate's privilege query.
