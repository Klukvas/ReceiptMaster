#!/usr/bin/env bash
# The precheck phase performs no filesystem or Docker mutations.
set -euo pipefail
exec python3 - "$@" <<'PY'
import contextlib, fcntl, hashlib, json, os, pathlib, re, subprocess, sys, time, urllib.request, urllib.parse

EXPECTED_MIGRATIONS = ['DocumentConfiguration1792100000000', 'DocumentStorageLeases1792100000001', 'DocumentUploadFencing1792100000002', 'AddAutoGenerateReceipt1792200000000', 'AddOrderItemUnitCost1792300000000', 'BackfillOrderItemUnitCost1792310000000', 'HashRefreshTokens1792400000000']
# Production runs as the restricted application role since 2026-10-31; a release now fails if that regresses.
REQUIRE_RESTRICTED_APP_ROLE = True
COMPOSE_NETWORK = 'marketflow-network'
PUBLIC_ORIGIN = 'https://receiptmaster.org'
RETAINED_RELEASES = 3
IMAGE_CLEANUP_SECONDS = 120
KNOWN_MIGRATIONS = ['AddAutoGenerateReceipt1792200000000', 'AddBrandedProformaSettings1762300000000', 'AddCompositeIndexes1761500000000', 'AddFailedReceiptStatus1762900000000', 'AddHeaderTextToUserSettings1761349000000', 'AddOnboardingCompleted1761800000000', 'AddOrderItemUnitCost1792300000000', 'AddOrderSoftDeletePaymentLock1761500000001', 'AddPaddleIndexes1762200000000', 'AddPerformanceIndexes1762000000000', 'AddProductQuantity1700000000006', 'AddProductSoftDelete1762500000000', 'AddPublicTokenToReceipts1762100000000', 'AddRLSPolicies1761500000006', 'AddReceiptHtmlTemplateVoid1761500000002', 'AddReceiptProcessingStatus1761500000005', 'AddReceiptProgressAndError1761600000000', 'AddReceiptTitleToUserSettings1761341614540', 'AddSupplierToProduct1762600000000', 'AddTelegramFields1700000000005', 'AddTemplateLanguageToUserSettings1761347647993', 'AddUserRelationsToOrdersAndReceipts1761232571111', 'AddUserRelationsToProductsAndRecipients1761176062970', 'BackfillOrderItemUnitCost1792310000000', 'CreateAuditLogsTable1761500000004', 'CreateIdempotencyKeysTable1761400000000', 'CreateRefreshTokensTable1761500000003', 'CreateSuppliersTable1761700000000', 'CreateTables1700000000000', 'CreateUserSettingsTable1761338524008', 'CreateUserSubscriptionsTable1761900000000', 'CreateUsersTable1700000000001', 'DocumentConfiguration1792100000000', 'DocumentStorageLeases1792100000001', 'DocumentUploadFencing1792100000002', 'DropPaymentStatusFromOrders1762400000000', 'HashRefreshTokens1792400000000', 'MakeReceiptTitleNullable1762800000000', 'ReceiptCapabilitiesAndOutbox1792000000000', 'RemoveFirstNameLastNameFromUsers1700000000005', 'SeedAdminBusinessSubscription1762700000000', 'SeedDefaultAdmin1700000000004', 'UpdateCurrencyToUAH1700000000003', 'UpdateProductsTable1700000000002']

def run(args, *, data=None, capture=True, timeout=300):
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.PIPE, check=False, timeout=timeout)
    if result.returncode:
        # Docker errors/config output can contain credentials. Do not echo them.
        raise RuntimeError('Command failed: ' + ' '.join(args[:3]))
    return result.stdout if capture else b''

def inspect(container):
    return json.loads(run(['docker', 'inspect', container]))[0]

def discover(service):
    ids = run(['docker', 'ps', '--filter', 'label=com.docker.compose.service=' + service,
               '--format', '{{.ID}}']).decode().split()
    if len(ids) != 1:
        raise RuntimeError('Expected exactly one running ' + service)
    return inspect(ids[0])

def sql(pg, statement):
    return run(['docker', 'exec', '-i', pg['Id'], 'sh', '-ec',
                'exec psql -X -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
               data=statement.encode()).decode().strip()

class RejectRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        raise RuntimeError('Release probes reject redirects')

def open_https(url, timeout=12):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname != 'receiptmaster.org' or parsed.port not in (None, 443) or parsed.username or parsed.password:
        raise RuntimeError('Release probes require the trusted HTTPS origin')
    request = urllib.request.Request(url, headers={'User-Agent': 'ReceiptMaster-Release-Check/1.0'})
    response = urllib.request.build_opener(RejectRedirects()).open(request, timeout=timeout)
    final = urllib.parse.urlsplit(response.geturl())
    if final.scheme != 'https' or final.netloc != parsed.netloc:
        response.close()
        raise RuntimeError('Release probe origin changed')
    return response

DATABASE_IDENTITY_SQL = "SELECT md5(current_database() || ':' || (SELECT oid::text FROM pg_database WHERE datname=current_database()) || ':' || extract(epoch from pg_postmaster_start_time())::text) AS identity"

APP_ROLE_SQL = "SELECT r.rolname, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb, ((SELECT count(*) FROM pg_class c WHERE c.relowner = r.oid AND c.relnamespace = 'public'::regnamespace) + (SELECT count(*) FROM pg_type t WHERE t.typowner = r.oid AND t.typnamespace = 'public'::regnamespace AND t.typtype IN ('e', 'd')) + (SELECT count(*) FROM pg_proc p WHERE p.proowner = r.oid AND p.pronamespace = 'public'::regnamespace))::int AS owned FROM pg_roles r WHERE r.rolname = current_user"

def check_app_role(role):
    print('Application database role (role/superuser/bypassrls/owned objects): ' + '|'.join([role['rolname'], 't' if role['rolsuper'] else 'f', 't' if role['rolbypassrls'] else 'f', str(role['owned'])]))
    if not any(role[key] for key in ('rolsuper', 'rolbypassrls', 'rolcreaterole', 'rolcreatedb', 'owned')):
        return
    if REQUIRE_RESTRICTED_APP_ROLE:
        raise RuntimeError('Application database role is not restricted')
    print('WARNING: application database role is not restricted')

def migration_command(compose, code, identity, app_role, check_only=False, run_id="local-test"):
    name = "receiptmaster-migration-" + run_id + ("-check" if check_only else "-apply")
    flags = ['-e', 'RELEASE_EXPECTED_DATABASE_IDENTITY=' + identity, '-e', 'RELEASE_APP_ROLE=' + app_role]
    if check_only: flags += ['-e', 'RELEASE_CHECK_ONLY=true']
    return compose + ['run', '--rm', '--no-deps', '-T', '--name', name, '--entrypoint', 'node'] + flags + ['migrate', '-e', code]

def release_override(images):
    # The server's Compose file is not updated by releases, so role separation and the public origin live here.
    # Credentials stay ${...} placeholders: this file is kept on disk and must never hold a secret.
    # postgres and db-backup are only ever recreated by an operator; --no-deps keeps the release off them.
    return {'services': {
        'backend': {'image': images['backend'], 'environment': {'BILLING_ENABLED': 'false', 'AUTO_RUN_MIGRATIONS': 'false', 'FRONTEND_URL': PUBLIC_ORIGIN}},
        'frontend': {'image': images['frontend']},
        'postgres': {'environment': {
            'POSTGRES_USER': '${POSTGRES_BOOTSTRAP_USER:-postgres}',
            'POSTGRES_PASSWORD': '${POSTGRES_BOOTSTRAP_PASSWORD:-${DB_PASSWORD}}'}},
        'db-backup': {'environment': {
            'DB_USERNAME': '${DB_BACKUP_USERNAME:-${DB_USERNAME}}',
            'PGPASSWORD': '${DB_BACKUP_PASSWORD:-${DB_PASSWORD}}'}},
        'migrate': {
            'image': images['backend'],
            'profiles': ['release-migrate'],
            'networks': [COMPOSE_NETWORK],
            'environment': {
                'NODE_ENV': 'production',
                'DB_HOST': 'postgres',
                'DB_PORT': '5432',
                'DB_NAME': '${DB_NAME}',
                'DB_USERNAME': '${DB_OWNER_USERNAME:-${DB_USERNAME}}',
                'DB_PASSWORD': '${DB_OWNER_PASSWORD:-${DB_PASSWORD}}'}},
    }}

class MigrationCompletionUnknown(RuntimeError):
    pass

def run_migration(command):
    name = command[command.index('--name') + 1]
    try:
        output = run(command)
    except Exception as migration_error:
        try:
            probe = ['docker','ps','--filter','name=^/' + name + '$','--format','{{.ID}}']
            if run(probe).strip():
                run(['docker','stop','--time','20',name])
            if run(probe).strip():
                raise RuntimeError('Migration container is still running')
        except Exception:
            raise MigrationCompletionUnknown('Migration termination unverified; automated application rollback withheld; manual intervention required') from migration_error
        raise
    # Container output can carry credentials: only the backfill's count-only warning
    # is shown, as ASCII so that printing cannot fail a completed migration.
    for line in output.decode('ascii', 'ignore').splitlines():
        if 'BackfillOrderItemUnitCost' in line:
            print(line)

def health(url):
    with open_https(url, timeout=12) as response:
        if response.status != 200:
            raise RuntimeError('HTTP health failed')
        payload = json.load(response)
    if payload.get('status') != 'ok' or any(payload.get(key) != 'ok' for key in ('db', 'redis')):
        raise RuntimeError('Dependency health failed')
    if payload.get('s3') not in ('ok', 'not_configured'):
        raise RuntimeError('Storage health failed')

def rollback_after_failure(deploy_error, stopped, original, release, old_images):
    if stopped:
        try:
            rollback = release / 'rollback.override.json'
            rollback.write_text(json.dumps({'services': {service: {'image': image} for service,image in old_images.items()}}))
            for service in ('backend', 'frontend'):
                run(original + ['-f', str(rollback), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--force-recreate', service])
            deadline = time.monotonic() + 120
            while True:
                try:
                    health('https://receiptmaster.org/api/v1/health')
                    with open_https('https://receiptmaster.org/?rollback=' + release.name, timeout=12) as response:
                        if response.status != 200: raise RuntimeError('Rollback frontend failed')
                        html = response.read().decode()
                    asset = re.search(r'<script[^>]+src="([^"]+\.js)"', html)
                    if not asset: raise RuntimeError('Rollback frontend asset missing')
                    with open_https('https://receiptmaster.org/' + asset.group(1).lstrip('/'), timeout=12) as response:
                        if response.status != 200: raise RuntimeError('Rollback frontend asset failed')
                    if any(discover(service)['Image'] != image for service, image in old_images.items()):
                        raise RuntimeError('Rollback running image mismatch')
                    break
                except Exception:
                    if time.monotonic() >= deadline:
                        raise RuntimeError('Rollback health deadline exceeded')
                    time.sleep(3)
            print('ROLLBACK VERIFIED: captured old application images, API/dependencies and TLS frontend/JS healthy; additive migration retained; release FAILED')
        except Exception:
            print('ROLLBACK HEALTH FAILED: application recovery is unverified; original deployment failed; manual intervention required')
    # Preserve the triggering deployment error even if rollback commands/health failed.
    raise deploy_error

def released_shas(configs):
    # Compose records every override oldest first. A rolled-back release leaves only its
    # rollback.override.json there, so the release.override.json entries are the history of
    # what stayed live, newest first here. Keep the files themselves: precheck requires every
    # one, while Compose resolves only the newest override's images.
    directories = [path.parent.name for path in map(pathlib.Path, configs) if path.name == 'release.override.json']
    shas = [name.split('-')[0] for name in directories if re.fullmatch('[0-9a-f]{40}-[0-9]+-[0-9]+', name)]
    return list(dict.fromkeys(reversed(shas)))

def stale_image_refs(rows, registry, retained_refs, in_use_ids):
    # Images are kept whole: a rollback tag is a second name for a release image, and
    # rmi without force still untags one name of an image that a container is using.
    pattern = re.escape(registry) + '/receiptmaster-(backend|frontend):[0-9a-f]{40}|receiptmaster-rollback-(backend|frontend):[0-9]+-[0-9]+'
    application = [(ref, image_id) for ref, image_id in rows if re.fullmatch(pattern, ref)]
    kept_ids = set(in_use_ids) | {image_id for ref, image_id in application if ref in retained_refs}
    return [ref for ref, image_id in application if image_id not in kept_ids]

def remove_stale_images(configs, registry, run_id, images, old_images):
    # The release is already live, so a failure here only warns and the next release retries.
    deadline = time.monotonic() + IMAGE_CLEANUP_SECONDS
    try:
        released = released_shas(configs)[:RETAINED_RELEASES]
        retained = {registry + '/receiptmaster-' + service + ':' + sha for service in images for sha in released} | {'receiptmaster-rollback-' + service + ':' + run_id for service in images}
        listing = run(['docker', 'image', 'ls', '--no-trunc', '--format', '{{.Repository}}:{{.Tag}} {{.ID}}'], timeout=IMAGE_CLEANUP_SECONDS)
        rows = [tuple(row.split()) for row in listing.decode().splitlines()]
        if not set(images.values()) <= {row[0] for row in rows}:
            raise RuntimeError('Released images are missing from the image listing')
        stale = stale_image_refs(rows, registry, retained, old_images.values())
    except Exception as error:
        print('WARNING: image cleanup skipped: ' + str(error))
        return
    removed = 0
    for ref in stale:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            print('WARNING: image cleanup reached its time limit; the next release continues it')
            break
        try:
            run(['docker', 'rmi', ref], timeout=remaining)
            removed += 1
        except Exception:
            print('WARNING: image cleanup could not remove ' + ref)
    print('IMAGE CLEANUP: removed ' + str(removed) + ' of ' + str(len(stale)) + ' stale application image tags')

def precheck(workdir, check_lock=True):
    backend, frontend, pg, redis = [discover(x) for x in ('backend', 'frontend', 'postgres', 'redis')]
    labels = backend['Config']['Labels']
    project = labels.get('com.docker.compose.project')
    if not project or any(x['Config']['Labels'].get('com.docker.compose.project') != project for x in (frontend, pg, redis)):
        raise RuntimeError('Ambiguous Compose project')
    actual_workdir = pathlib.Path(labels.get('com.docker.compose.project.working_dir', '')).resolve()
    if actual_workdir != pathlib.Path(workdir).resolve():
        raise RuntimeError('Unexpected production working directory')
    configs = labels.get('com.docker.compose.project.config_files', '').split(',')
    if not configs or any(not pathlib.Path(p).is_file() for p in configs):
        raise RuntimeError('Original Compose configuration unavailable')
    if frontend['Config']['Labels'].get('com.docker.compose.project.config_files') != ','.join(configs):
        raise RuntimeError('Application configuration mismatch')
    recorded_env = labels.get('com.docker.compose.project.environment_file', '')
    if frontend['Config']['Labels'].get('com.docker.compose.project.environment_file', '') != recorded_env:
        raise RuntimeError('Application environment provenance mismatch')
    # Without explicit Compose metadata, the default .env is accepted only if its
    # resolved configuration matches both running applications below.
    envfiles = [pathlib.Path(value) for value in recorded_env.split(',')] if recorded_env else [actual_workdir / '.env']
    if any(not path.is_absolute() or not path.is_file() or not os.access(path, os.R_OK) for path in envfiles):
        raise RuntimeError('Original environment source unavailable or ambiguous')
    networks = set(backend['NetworkSettings']['Networks']) & set(pg['NetworkSettings']['Networks']) & set(redis['NetworkSettings']['Networks'])
    if len(networks) != 1 or not backend['Mounts'] or not frontend['NetworkSettings']['Ports']:
        raise RuntimeError('Unexpected application mounts, networks or ports')
    image_environments = {}
    for service, app in (('backend', backend), ('frontend', frontend)):
        current_image = json.loads(run(['docker', 'image', 'inspect', app['Image']]))[0]
        image_environments[service] = dict(item.split('=', 1) for item in (current_image['Config'].get('Env') or []) if '=' in item)
    environment_args = sum((['--env-file', str(path)] for path in envfiles), [])
    effective_args = ['docker','compose','--project-name',project,'--project-directory',str(actual_workdir)] + environment_args + sum((['-f', path] for path in configs), []) + ['config','--format','json']
    effective_services = json.loads(run(effective_args))['services']
    hash_lines = run(effective_args[:-3] + ['config','--hash','backend,frontend']).decode().splitlines()
    original_hashes = {}
    for line in hash_lines:
        parts = line.split()
        if len(parts) != 2 or parts[0] not in ('backend','frontend') or parts[0] in original_hashes or not re.fullmatch('[0-9a-f]{64}', parts[1]):
            raise RuntimeError('Original Compose configuration hash unavailable')
        original_hashes[parts[0]] = parts[1]
    for service, app in (('backend', backend), ('frontend', frontend)):
        if original_hashes.get(service) != app['Config']['Labels'].get('com.docker.compose.config-hash') or service not in original_hashes:
            raise RuntimeError('Original Compose configuration hash differs from running ' + service)

    for service, app in (('backend', backend), ('frontend', frontend)):
        running = dict(item.split('=', 1) for item in app['Config']['Env'] if '=' in item)
        expected = image_environments[service].copy()
        for key, value in (effective_services[service].get('environment') or {}).items():
            if value is None:
                expected.pop(key, None)
            else:
                expected[key] = str(value)
        if expected != running:
            raise RuntimeError('Effective application environment differs from running ' + service)
    # In-memory inspection only. Values are neither logged nor persisted.
    appenv = dict(item.split('=', 1) for item in backend['Config']['Env'] if '=' in item)
    pgenv = dict(item.split('=', 1) for item in pg['Config']['Env'] if '=' in item)
    if appenv.get('DB_NAME') != pgenv.get('POSTGRES_DB'):
        raise RuntimeError('Privileged migration/backup database identity unavailable')
    if not re.fullmatch('[a-z_][a-z0-9_]*', appenv.get('DB_USERNAME', '')):
        raise RuntimeError('Application database role name unavailable')
    # The pre-release dump runs as this role, after the backend has already stopped.
    if sql(pg, "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user;") != 't':
        raise RuntimeError('Backup database role cannot dump RLS tables')
    database_identity = sql(pg, DATABASE_IDENTITY_SQL)
    if not re.fullmatch('[0-9a-f]{32}', database_identity):
        raise RuntimeError('Backup database identity unavailable')
    def runtime_row(statement):
        # The backend's own connection is the only honest source for what the app runs as.
        code = "const {Client}=require('pg'); const c=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionTimeoutMillis:10000});(async()=>{try{await c.connect();const r=await c.query(" + json.dumps(statement) + ");process.stdout.write(JSON.stringify(r.rows[0]))}finally{await c.end()}})().catch(()=>process.exitCode=1)"
        return json.loads(run(['docker','exec',backend['Id'],'node','-e',code]))
    if runtime_row(DATABASE_IDENTITY_SQL).get('identity') != database_identity:
        raise RuntimeError('Running application does not use the backed-up database instance')
    check_app_role(runtime_row(APP_ROLE_SQL))
    table = sql(pg, "SELECT to_regclass('public.migrations') IS NOT NULL;")
    if table != 't':
        raise RuntimeError('Migration history is absent')
    history = sql(pg, 'SELECT name FROM migrations ORDER BY timestamp;').splitlines()
    if not history or any(not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]+', name) for name in history):
        raise RuntimeError('Invalid migration history')
    if set(history) - set(KNOWN_MIGRATIONS) or set(KNOWN_MIGRATIONS) - set(history) - set(EXPECTED_MIGRATIONS):
        raise RuntimeError('Unexpected pending or unknown migrations')
    lock_path = actual_workdir.parent / '.receiptmaster-deploy.lock'
    if check_lock and lock_path.exists():
        with lock_path.open('r') as existing_lock:
            fcntl.flock(existing_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    # The new image rechecks its authoritative migration set before maintenance.
    run(['docker', 'exec', pg['Id'], 'pg_dump', '--version'])
    run(['docker', 'exec', pg['Id'], 'pg_restore', '--version'])
    database_size = int(sql(pg, 'SELECT pg_database_size(current_database());'))
    if os.statvfs(actual_workdir).f_bavail * os.statvfs(actual_workdir).f_frsize < max(2 * 1024**3, database_size * 3):
        raise RuntimeError('Insufficient backup/release disk space')
    health('https://receiptmaster.org/api/v1/health')
    print('PRECHECK PASS: project, existing environment, retained images, database tools and baseline health')
    return backend, frontend, pg, redis, project, actual_workdir, configs, envfiles, next(iter(networks)), history, database_identity

phase, workdir, sha, run_id, registry = sys.argv[1:]
if phase not in ('precheck', 'deploy') or not re.fullmatch('[0-9a-f]{40}', sha) or not re.fullmatch('[0-9]+-[0-9]+', run_id) or not re.fullmatch('[a-z0-9_-]+', registry):
    raise SystemExit('Invalid release arguments')
try:
    state = precheck(workdir)
    if phase == 'precheck':
        raise SystemExit(0)
    backend, frontend, pg, redis, project, work, configs, envfiles, network, history, database_identity = state
    release = work.parent / 'releases' / (sha + '-' + run_id)
    if pathlib.Path(__file__).name == '-':
        # deploy is executed from the checksum-verified release directory.
        release = pathlib.Path.cwd().resolve()
    if release.name != sha + '-' + run_id or release.parent != work.parent / 'releases':
        raise RuntimeError('Unexpected unique release directory')
    if (release / 'release.sha').read_text().strip() != sha:
        raise RuntimeError('Release SHA mismatch')
    with open(work.parent / '.receiptmaster-deploy.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        state = precheck(str(work), check_lock=False)
        backend, frontend, pg, redis, project, work, configs, envfiles, network, history, database_identity = state
        old_images = {'backend': backend['Image'], 'frontend': frontend['Image']}
        for service, image in old_images.items():
            run(['docker', 'tag', image, 'receiptmaster-rollback-' + service + ':' + run_id])
        images = {service: registry + '/receiptmaster-' + service + ':' + sha for service in old_images}
        for image in images.values():
            run(['docker', 'pull', image])
            labels = json.loads(run(['docker', 'image', 'inspect', image]))[0]['Config'].get('Labels', {})
            if labels.get('org.opencontainers.image.version') != sha:
                raise RuntimeError('Published image version mismatch')
        override = release / 'release.override.json'
        override.write_text(json.dumps(release_override(images)))
        base = ['docker', 'compose', '--project-name', project, '--project-directory', str(work)] + sum((['--env-file', str(path)] for path in envfiles), [])
        original = base + sum((['-f', path] for path in configs), [])
        new = original + ['-f', str(override)]
        migration_code = r"""
const ds=require('./dist/config/ormconfig').default;
(async()=>{ ds.setOptions({extra:{...ds.options.extra,options:'-c lock_timeout=30000 -c statement_timeout=180000'}}); await ds.initialize(); const q=ds.createQueryRunner(); await q.connect();
try { const fingerprint=await q.query("SELECT md5(current_database() || ':' || (SELECT oid::text FROM pg_database WHERE datname=current_database()) || ':' || extract(epoch from pg_postmaster_start_time())::text) AS identity"); if(fingerprint[0].identity!==process.env.RELEASE_EXPECTED_DATABASE_IDENTITY) throw Error('Backup/migration database identity mismatch'); await q.query("SET lock_timeout = '30s'"); await q.query('SELECT pg_advisory_lock(3217891453)');
const completed=new Set((await q.query('SELECT name FROM migrations')).map(r=>r.name));
if([...completed].some(name=>!ds.migrations.some(m=>(m.name||m.constructor.name)===name))) throw Error('Unknown executed migration');
const pending=ds.migrations.filter(m=>!completed.has(m.name||m.constructor.name));
const expected=new Set(__EXPECTED_MIGRATIONS__);
if(pending.some(m=>!expected.has(m.name||m.constructor.name))) throw Error('Unexpected pending migration');
if(pending.length){ const schema=await q.query("SELECT has_schema_privilege(current_user,'public','CREATE') AS ok"); if(!schema[0].ok) throw Error('Migration role cannot create in public');
const owned=await q.query("SELECT ((SELECT count(*) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','S') AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e') AND NOT pg_has_role(current_user,c.relowner,'USAGE')) + (SELECT count(*) FROM pg_type t WHERE t.typnamespace='public'::regnamespace AND t.typtype IN ('e','d') AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid='pg_type'::regclass AND d.objid=t.oid AND d.deptype='e') AND NOT pg_has_role(current_user,t.typowner,'USAGE')) + (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') AND NOT pg_has_role(current_user,p.proowner,'USAGE')))::int AS unowned"); if(owned[0].unowned!==0) throw Error('Migration role does not own the schema objects'); }
const assertRuntimePrivileges=async()=>{ const rows=await q.query("SELECT count(*)::int AS missing FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND ((c.relkind IN ('r','p') AND ((c.relname='migrations' AND NOT has_table_privilege($1::name,c.oid,'SELECT')) OR (c.relname='audit_logs' AND NOT (has_table_privilege($1::name,c.oid,'SELECT') AND has_table_privilege($1::name,c.oid,'INSERT'))) OR (c.relname NOT IN ('migrations','audit_logs') AND NOT (has_table_privilege($1::name,c.oid,'SELECT') AND has_table_privilege($1::name,c.oid,'INSERT') AND has_table_privilege($1::name,c.oid,'UPDATE') AND has_table_privilege($1::name,c.oid,'DELETE'))))) OR (CASE WHEN c.relkind='S' THEN NOT has_sequence_privilege($1::name,c.oid,'USAGE') ELSE false END))",[process.env.RELEASE_APP_ROLE]); if(rows[0].missing!==0) throw Error('Runtime table privileges unavailable'); };
await assertRuntimePrivileges();
if(process.env.RELEASE_CHECK_ONLY==='true') return;
await ds.runMigrations({transaction:'all'});
await assertRuntimePrivileges();
} finally { await q.query('SELECT pg_advisory_unlock(3217891453)'); await q.release(); await ds.destroy(); }
})().catch(()=>{console.error('Migration readiness/apply failed');process.exitCode=1});
""".replace('__EXPECTED_MIGRATIONS__', json.dumps(EXPECTED_MIGRATIONS))
        app_role = dict(item.split('=', 1) for item in backend['Config']['Env'] if '=' in item)['DB_USERNAME']
        migration = migration_command(new, migration_code, database_identity, app_role, run_id=run_id)
        # This uses the exact same validated Compose environment as the new backend.
        check = migration_command(new, migration_code, database_identity, app_role, check_only=True, run_id=run_id)
        run_migration(check)
        backup_root = work.parent / 'backups'
        backup_root.mkdir(mode=0o700, exist_ok=True)
        backup = backup_root / ('pre-' + sha + '-' + run_id + '.dump')
        partial = backup.with_suffix('.partial')
        stopped = False
        try:
            run(['docker', 'stop', backend['Id']]); stopped = True
            fd = os.open(partial, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'wb') as output:
                result = subprocess.run(['docker', 'exec', pg['Id'], 'sh', '-ec', 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], stdout=output, stderr=subprocess.PIPE, timeout=300)
            if result.returncode or partial.stat().st_size == 0:
                raise RuntimeError('Database backup failed')
            for args in (['--list'], ['--file=/dev/null']):
                with partial.open('rb') as source:
                    result = subprocess.run(['docker', 'exec', '-i', pg['Id'], 'pg_restore'] + args, stdin=source, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=300)
                if result.returncode:
                    raise RuntimeError('Complete backup validation failed')
            checksum = hashlib.sha256()
            with partial.open('rb') as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b''):
                    checksum.update(chunk)
            digest = checksum.hexdigest()
            partial.rename(backup)
            backup.with_suffix('.sha256').write_text(digest + '  ' + backup.name + '\n')
            print('BACKUP VERIFIED: custom archive, complete payload, SHA256; no production restore performed')
            run_migration(migration)
            for service in ('backend', 'frontend'):
                run(new + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--force-recreate', service])
            deadline = time.time() + 120
            while True:
                try:
                    health('https://receiptmaster.org/api/v1/health')
                    with open_https('https://receiptmaster.org/api/v1/billing/config', timeout=12) as response:
                        if json.load(response).get('billingEnabled') is not False:
                            raise RuntimeError('Billing must be disabled')
                    with open_https('https://receiptmaster.org/release.json?release=' + sha, timeout=12) as response:
                        marker = json.load(response)
                        if marker.get('sha') != sha or marker.get('billingEnabled') is not False:
                            raise RuntimeError('Public frontend release version mismatch')
                    with open_https('https://receiptmaster.org/?release=' + sha, timeout=12) as response:
                        html = response.read().decode()
                    asset = re.search(r'<script[^>]+src="([^"]+\.js)"', html)
                    if not asset: raise RuntimeError('Frontend asset missing')
                    with open_https('https://receiptmaster.org/' + asset.group(1).lstrip('/'), timeout=12) as response:
                        if response.status != 200: raise RuntimeError('Frontend asset failed')
                    for service in ('backend', 'frontend'):
                        if discover(service)['Image'] != json.loads(run(['docker','image','inspect',images[service]]))[0]['Id']:
                            raise RuntimeError('Running image version mismatch')
                    break
                except Exception:
                    if time.time() >= deadline: raise RuntimeError('Release health deadline exceeded')
                    time.sleep(3)
            print('DEPLOY PASS: immutable image pair, billing disabled, API/dependencies, TLS frontend/JS health')
        except Exception as deploy_error:
            rollback_after_failure(deploy_error, stopped and not isinstance(deploy_error, MigrationCompletionUnknown), original, release, old_images)
        # rollback_after_failure always raises, so only a verified release reaches this line.
        # The deploy lock is still held, so no other release can be using these images.
        remove_stale_images(configs + [str(override)], registry, run_id, images, old_images)

except Exception as error:
    print('RELEASE BLOCKED: ' + str(error), file=sys.stderr)
    raise SystemExit(1)
PY
