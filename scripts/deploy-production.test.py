"""Execute production precheck seams with fake Docker; never contacts production."""
import contextlib
import fcntl
import io
import json
import pathlib
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).with_name('deploy-production.sh').read_text().split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
PREFIX = SCRIPT.split('phase, workdir, sha, run_id, registry =', 1)[0]
MAIN = SCRIPT[len(PREFIX):]

class ReleasePrecheckTests(unittest.TestCase):
    def setUp(self):
        self.space = tempfile.TemporaryDirectory(dir=pathlib.Path(__file__).resolve().parent)
        self.work = pathlib.Path(self.space.name)
        (self.work / '.env').write_text('SYNTHETIC_TEST_ONLY=1\n')
        config = self.work / 'compose.yml'; config.write_text('services: {}\n')
        labels = {'com.docker.compose.config-hash': 'a' * 64, 'com.docker.compose.project': 'existing', 'com.docker.compose.project.working_dir': str(self.work), 'com.docker.compose.project.config_files': str(config)}
        self.containers = {service: {'Id': service, 'Image': 'sha256:old-' + service, 'Config': {'Labels': labels.copy(), 'Env': ['DB_NAME=fixture','DB_USERNAME=fixture'] if service == 'backend' else ['POSTGRES_DB=fixture','POSTGRES_USER=fixture']}, 'Mounts': [{}], 'NetworkSettings': {'Networks': {'existing-network': {}}, 'Ports': {'80/tcp': [{}]}}} for service in ('backend', 'frontend', 'postgres', 'redis')}
        self.ns = {}; exec(compile(PREFIX, '<release>', 'exec'), self.ns)
        self.history = [name for name in self.ns['KNOWN_MIGRATIONS'] if name not in self.ns['EXPECTED_MIGRATIONS']]
        self.calls = []
        self.image_env = {'backend': [], 'frontend': []}
        self.runtime_identity = 'a' * 32
        self.backup_role_can_dump = 't'
        self.app_role = {'rolname': 'fixture', 'rolsuper': False, 'rolbypassrls': False, 'rolcreaterole': False, 'rolcreatedb': False, 'owned': 0}
        def run(args, **kwargs):
            import json
            self.calls.append(args)
            if args[-2:] == ['--hash','backend,frontend']:
                return ('backend ' + 'a' * 64 + '\nfrontend ' + 'a' * 64 + '\n').encode()
            if args[1:3] == ['image','inspect']:
                service = next(key for key in self.image_env if args[3] == self.containers[key]['Image'])
                return json.dumps([{'Config': {'Env': self.image_env[service]}}]).encode()
            return json.dumps({'services': {service: {'environment': dict(item.split('=',1) for item in self.containers[service]['Config']['Env'])} for service in ('backend','frontend')}}).encode() if args[1] == 'compose' else json.dumps(self.app_role if 'rolsuper' in args[-1] else {'identity': self.runtime_identity}).encode() if args[1:3] == ['exec','backend'] else b'[]'
        def sql(pg, statement):
            if 'AS identity' in statement: return 'a' * 32
            if 'rolsuper OR rolbypassrls' in statement: return self.backup_role_can_dump
            if 'to_regclass' in statement: return 't'
            if 'SELECT name' in statement: return '\n'.join(self.history)
            if 'pg_policies' in statement: return '0'
            if 'pg_database_size' in statement: return '1024'
            raise AssertionError(statement)
        self.ns.update(discover=lambda service: self.containers[service], run=run, sql=sql, health=lambda url: None)
    def tearDown(self): self.space.cleanup()
    def check(self): return self.ns['precheck'](str(self.work))
    def test_precheck_preserves_env_and_has_no_mutating_commands(self):
        before = (self.work / '.env').read_bytes(); state = self.check()
        self.assertEqual(state[4], 'existing'); self.assertEqual((self.work / '.env').read_bytes(), before)
        self.assertTrue(all(args[1:3] in (['image','inspect'], ['exec','postgres'], ['exec','backend']) or args[1] == 'compose' for args in self.calls))
        self.assertTrue(all('pull' not in args and 'stop' not in args and 'run' not in args for args in self.calls))
    def test_only_the_backfill_pending_passes_on_the_released_history(self):
        self.history = [name for name in self.ns['KNOWN_MIGRATIONS'] if name != 'BackfillOrderItemUnitCost1792310000000']
        self.assertIn('AddOrderItemUnitCost1792300000000', self.history)
        self.assertEqual(self.check()[9], self.history)
    def test_backfill_already_applied_passes(self):
        self.history = list(self.ns['KNOWN_MIGRATIONS'])
        self.assertEqual(self.check()[9], self.history)
    def test_unknown_history_blocks_before_mutation(self):
        self.history.append('UnknownMigration9999999999999')
        with self.assertRaisesRegex(RuntimeError, 'Unexpected pending'): self.check()
    def test_missing_old_migration_blocks(self):
        self.history.pop()
        with self.assertRaisesRegex(RuntimeError, 'Unexpected pending'): self.check()
    def test_different_db_identity_blocks(self):
        self.containers['backend']['Config']['Env'] = ['DB_NAME=wrong','DB_USERNAME=fixture']
        with self.assertRaisesRegex(RuntimeError, 'identity'): self.check()
    def test_ambiguous_project_blocks(self):
        self.containers['frontend']['Config']['Labels']['com.docker.compose.project'] = 'other'
        with self.assertRaisesRegex(RuntimeError, 'Ambiguous'): self.check()
    def test_wrong_workdir_blocks(self):
        with self.assertRaisesRegex(RuntimeError, 'working directory'): self.ns['precheck'](str(self.work / 'wrong'))
    def test_missing_release_override_in_the_chain_blocks(self):
        # This is why release directories are never deleted, even though their images are.
        for service in ('backend','frontend'):
            self.containers[service]['Config']['Labels']['com.docker.compose.project.config_files'] += ',' + str(self.work / 'removed' / 'release.override.json')
        with self.assertRaisesRegex(RuntimeError, 'Compose configuration unavailable'): self.check()
    def test_baseline_health_failure_blocks(self):
        self.ns['health'] = lambda url: (_ for _ in ()).throw(RuntimeError('baseline down'))
        with self.assertRaisesRegex(RuntimeError, 'baseline down'): self.check()
    def test_wrong_runtime_instance_blocks_before_mutation(self):
        self.runtime_identity = 'b' * 32
        with self.assertRaisesRegex(RuntimeError, 'backed-up database instance'): self.check()
        self.assertFalse(any('stop' in args or 'pull' in args or 'run' in args for args in self.calls))
    def test_invalid_runtime_password_connection_blocks(self):
        original_run = self.ns['run']
        def run(args, **kwargs):
            if args[1:3] == ['exec','backend']: raise RuntimeError('Connection failed')
            return original_run(args, **kwargs)
        self.ns['run'] = run
        with self.assertRaisesRegex(RuntimeError, 'Connection failed'): self.check()
    def checked_output(self):
        import contextlib, io
        output = io.StringIO()
        with contextlib.redirect_stdout(output): self.check()
        return output.getvalue()
    def test_split_application_and_bootstrap_roles_are_accepted(self):
        self.containers['backend']['Config']['Env'] = ['DB_NAME=fixture','DB_USERNAME=rm_app']
        self.containers['postgres']['Config']['Env'] = ['POSTGRES_DB=fixture','POSTGRES_USER=postgres']
        self.app_role['rolname'] = 'rm_app'
        self.assertIn('rm_app|f|f|0', self.checked_output())
    def test_role_flags_come_from_the_backend_connection(self):
        recorded = []
        original_sql = self.ns['sql']
        self.ns['sql'] = lambda pg, statement: recorded.append(statement) or original_sql(pg, statement)
        self.check()
        self.assertNotIn(self.ns['APP_ROLE_SQL'], recorded)
        self.assertTrue(any(args[1:3] == ['exec','backend'] and 'rolsuper' in args[-1] for args in self.calls))
    def test_unrestricted_app_role_warns_until_required(self):
        for flag, value in (('rolsuper',True),('rolbypassrls',True),('rolcreaterole',True),('rolcreatedb',True),('owned',3)):
            with self.subTest(flag=flag):
                self.app_role[flag] = value
                self.ns['REQUIRE_RESTRICTED_APP_ROLE'] = False
                self.assertIn('WARNING', self.checked_output())
                self.ns['REQUIRE_RESTRICTED_APP_ROLE'] = True
                with self.assertRaisesRegex(RuntimeError, 'not restricted'): self.check()
                self.app_role[flag] = 0 if flag == 'owned' else False
    def test_restricted_app_role_passes_when_required(self):
        self.ns['REQUIRE_RESTRICTED_APP_ROLE'] = True
        self.assertNotIn('WARNING', self.checked_output())
    def test_malformed_application_role_name_blocks(self):
        self.containers['backend']['Config']['Env'] = ['DB_NAME=fixture','DB_USERNAME=bad-role"name']
        with self.assertRaisesRegex(RuntimeError, 'role name unavailable'): self.check()
    def test_backup_role_without_rls_bypass_blocks_before_mutation(self):
        self.backup_role_can_dump = 'f'
        with self.assertRaisesRegex(RuntimeError, 'cannot dump RLS tables'): self.check()
        self.assertFalse(any('stop' in args or 'pull' in args or 'run' in args for args in self.calls))
    def test_recorded_alternate_env_file_is_preserved(self):
        alternate = self.work / 'alternate.env'; alternate.write_text('SYNTHETIC_TEST_ONLY=2\n')
        for service in ('backend','frontend'):
            self.containers[service]['Config']['Labels']['com.docker.compose.project.environment_file'] = str(alternate)
        state = self.check()
        self.assertEqual(state[7], [alternate])
        command = next(args for args in self.calls if args[1] == 'compose')
        self.assertIn(str(alternate), command)
        self.assertNotIn(str(self.work / '.env'), command)
    def test_backend_or_frontend_secret_drift_rejected(self):
        import json
        for service in ('backend','frontend'):
            with self.subTest(service=service):
                original_run = self.ns['run']
                def run(args, **kwargs):
                    output = original_run(args, **kwargs)
                    if args[1] == 'compose' and args[-2:] == ['--format','json']:
                        config = json.loads(output); config['services'][service]['environment']['JWT_SECRET'] = 'synthetic-unactivated-change'
                        return json.dumps(config).encode()
                    return output
                self.ns['run'] = run
                with self.assertRaisesRegex(RuntimeError, 'environment differs'): self.check()
                self.ns['run'] = original_run
    def test_removed_runtime_secret_is_rejected_for_both_apps(self):
        import json
        for service in ('backend','frontend'):
            with self.subTest(service=service):
                self.containers[service]['Config']['Env'].append('JWT_SECRET=synthetic-active-value')
                original_run = self.ns['run']
                def run(args, **kwargs):
                    output = original_run(args, **kwargs)
                    if args[1] == 'compose' and args[-2:] == ['--format','json']:
                        config = json.loads(output); del config['services'][service]['environment']['JWT_SECRET']
                        return json.dumps(config).encode()
                    return output
                self.ns['run'] = run
                with self.assertRaisesRegex(RuntimeError, 'environment differs'): self.check()
                self.ns['run'] = original_run
                self.containers[service]['Config']['Env'].pop()
    def test_genuine_image_defaults_are_accepted_without_compose_entries(self):
        import json
        for service in ('backend','frontend'):
            self.image_env[service] = ['PATH=/synthetic/image/path']
            self.containers[service]['Config']['Env'].append('PATH=/synthetic/image/path')
        original_run = self.ns['run']
        def run(args, **kwargs):
            output = original_run(args, **kwargs)
            if args[1] == 'compose' and args[-2:] == ['--format','json']:
                config = json.loads(output)
                for service in ('backend','frontend'): del config['services'][service]['environment']['PATH']
                return json.dumps(config).encode()
            return output
        self.ns['run'] = run
        self.check()
    def test_explicit_unset_removes_image_environment(self):
        import json
        self.image_env['backend'] = ['OPTIONAL_IMAGE_SETTING=synthetic-default']
        original_run = self.ns['run']
        def run(args, **kwargs):
            output = original_run(args, **kwargs)
            if args[1] == 'compose' and args[-2:] == ['--format','json']:
                config = json.loads(output); config['services']['backend']['environment']['OPTIONAL_IMAGE_SETTING'] = None
                return json.dumps(config).encode()
            return output
        self.ns['run'] = run
        self.check()
    def test_real_compose_hash_rejects_receipts_mount_and_https_port_drift(self):
        import json, shutil, subprocess
        if not shutil.which('docker'): self.skipTest('Docker Compose CLI is unavailable')
        services = {
            'backend': {'image':'synthetic-backend:fixed','environment':dict(item.split('=',1) for item in self.containers['backend']['Config']['Env']), 'volumes':[str(self.work / 'receipts') + ':/app/receipts']},
            'frontend': {'image':'synthetic-frontend:fixed','environment':dict(item.split('=',1) for item in self.containers['frontend']['Config']['Env']), 'ports':['443:443']},
        }
        def real_hash():
            return subprocess.run(['docker','compose','--env-file','/dev/null','-p','release-hash-fixture','-f','-','config','--hash','backend,frontend'],input=json.dumps({'services':services}).encode(),capture_output=True,check=True).stdout
        hashes = dict(line.split() for line in real_hash().decode().splitlines())
        for service in ('backend','frontend'): self.containers[service]['Config']['Labels']['com.docker.compose.config-hash'] = hashes[service]
        original_run = self.ns['run']
        def run(args, **kwargs):
            if args[-2:] == ['--hash','backend,frontend']: return real_hash()
            if args[1] == 'compose' and args[-2:] == ['--format','json']: return json.dumps({'services':services}).encode()
            return original_run(args, **kwargs)
        self.ns['run'] = run
        self.check()  # identical original configuration is accepted.
        for service, field, drift in [('backend','volumes',[str(self.work / 'different-receipts') + ':/app/receipts']), ('frontend','ports',['8443:443'])]:
            with self.subTest(drift=field):
                original_value = services[service][field]
                services[service][field] = drift
                try:
                    with self.assertRaisesRegex(RuntimeError, 'configuration hash differs'): self.check()
                finally:
                    services[service][field] = original_value
    def test_missing_config_hash_fails_closed(self):
        del self.containers['backend']['Config']['Labels']['com.docker.compose.config-hash']
        with self.assertRaisesRegex(RuntimeError, 'configuration hash differs'): self.check()
    def test_actual_command_construction_preserves_checked_interpolation_context(self):
        import ast, json, os, shutil, subprocess
        if not shutil.which('docker'): self.skipTest('Docker Compose CLI is unavailable')
        config = self.work / 'interpolation-compose.json'
        config.write_text(json.dumps({'services': {
            'backend': {'image':'${DOCKERHUB_USERNAME}/backend:${IMAGE_TAG}', 'environment':{'CUSTOM_RELEASE_CONTEXT':'${IMAGE_TAG}'}, 'volumes':['./receipts-${IMAGE_TAG}:/app/receipts']},
            'frontend': {'image':'${DOCKERHUB_USERNAME}/frontend:${IMAGE_TAG}'},
            'postgres': {'image':'postgres:15-alpine'},
            'db-backup': {'image':'market-db-backup'},
        }, 'networks': {'marketflow-network': {}}}))
        envfile = self.work / 'original-synthetic.env'; envfile.write_text('IMAGE_TAG=file-default\nDOCKERHUB_USERNAME=file-registry\n')
        def resolve(command):
            return json.loads(subprocess.run(command + ['config','--format','json'],capture_output=True,check=True).stdout)
        tree = ast.parse(SCRIPT)
        lock = next(node for node in ast.walk(tree) if isinstance(node,ast.With) and any(isinstance(item.optional_vars,ast.Name) and item.optional_vars.id == 'lock' for item in node.items))
        selected = []
        for node in lock.body:
            if isinstance(node,ast.Assign):
                target = node.targets[0]
                if isinstance(target,ast.Name) and target.id in ('images','override','base','original','new'):
                    selected.append(node)
                elif isinstance(target,ast.Subscript) and isinstance(target.value,ast.Attribute) and isinstance(target.value.value,ast.Name) and target.value.value.id == 'os' and target.value.attr == 'environ':
                    selected.append(node)
            elif isinstance(node,ast.Expr) and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Attribute) and isinstance(node.value.func.value,ast.Name) and node.value.func.value.id == 'override' and node.value.func.attr == 'write_text':
                selected.append(node)
        with patch.dict(os.environ,{'IMAGE_TAG':'checked-original','DOCKERHUB_USERNAME':'checked-registry'}):
            command = ['docker','compose','--project-name','context-fixture','--project-directory',str(self.work),'--env-file',str(envfile),'-f',str(config)]
            before = resolve(command)
            scope = {'os':os,'json':json,'project':'context-fixture','work':self.work,'envfiles':[envfile],'configs':[str(config)],'release':self.work,'sha':'b'*40,'registry':'new-registry','old_images':{'backend':'old-backend','frontend':'old-frontend'},'release_override':self.ns['release_override']}
            exec(compile(ast.Module(body=selected,type_ignores=[]),'<actual-release-command-construction>','exec'),scope)
            after = resolve(scope['original'])
            deployed = resolve(scope['new'])
            self.assertEqual(before,after)
            self.assertEqual(deployed['services']['backend']['volumes'],before['services']['backend']['volumes'])
            self.assertEqual(deployed['services']['backend']['environment']['CUSTOM_RELEASE_CONTEXT'],'checked-original')
            self.assertEqual(deployed['services']['backend']['image'],'new-registry/receiptmaster-backend:'+'b'*40)
            self.assertEqual(deployed['services']['frontend']['image'],'new-registry/receiptmaster-frontend:'+'b'*40)
            self.assertNotIn('migrate',deployed['services'])
    def test_real_compose_resolves_role_separation_from_the_override_alone(self):
        import json, shutil, subprocess
        if not shutil.which('docker'): self.skipTest('Docker Compose CLI is unavailable')
        base = self.work / 'frozen-compose.json'
        base.write_text(json.dumps({'services': {
            'backend': {'image':'old-backend','environment':['DB_USERNAME=${DB_USERNAME}','DB_PASSWORD=${DB_PASSWORD}']},
            'frontend': {'image':'old-frontend'},
            'postgres': {'image':'postgres:15-alpine','environment':['POSTGRES_USER=${DB_USERNAME}','POSTGRES_PASSWORD=${DB_PASSWORD}']},
            'db-backup': {'image':'market-db-backup','environment':['DB_USERNAME=${DB_USERNAME}','PGPASSWORD=${DB_PASSWORD}']},
        }, 'networks': {'marketflow-network': {}}}))
        override = self.work / 'release.override.json'
        override.write_text(json.dumps(self.ns['release_override']({'backend':'new-backend','frontend':'new-frontend'})))
        def services(env):
            envfile = self.work / 'resolved.env'; envfile.write_text(env)
            command = ['docker','compose','--project-name','roles-fixture','--project-directory',str(self.work),'--env-file',str(envfile),'-f',str(base),'-f',str(override),'--profile','release-migrate','config','--format','json']
            return json.loads(subprocess.run(command,capture_output=True,check=True).stdout)['services']
        legacy = services('DB_NAME=market\nDB_USERNAME=legacy-user\nDB_PASSWORD=legacy-secret\n')
        self.assertEqual(legacy['migrate']['environment']['DB_USERNAME'],'legacy-user')
        self.assertEqual(legacy['migrate']['environment']['DB_PASSWORD'],'legacy-secret')
        self.assertEqual(legacy['db-backup']['environment']['DB_USERNAME'],'legacy-user')
        split = services('DB_NAME=market\nDB_USERNAME=rm_app\nDB_PASSWORD=app-secret\nDB_OWNER_USERNAME=rm_owner\nDB_OWNER_PASSWORD=owner-secret\nDB_BACKUP_USERNAME=rm_backup\nDB_BACKUP_PASSWORD=backup-secret\nPOSTGRES_BOOTSTRAP_PASSWORD=bootstrap-secret\n')
        self.assertEqual(split['migrate']['environment']['DB_USERNAME'],'rm_owner')
        self.assertEqual(split['migrate']['environment']['DB_PASSWORD'],'owner-secret')
        self.assertEqual(split['migrate']['image'],'new-backend')
        self.assertEqual(split['migrate']['profiles'],['release-migrate'])
        self.assertEqual(split['db-backup']['environment']['DB_USERNAME'],'rm_backup')
        self.assertEqual(split['db-backup']['environment']['PGPASSWORD'],'backup-secret')
        self.assertEqual(split['postgres']['environment']['POSTGRES_USER'],'postgres')
        self.assertEqual(split['postgres']['environment']['POSTGRES_PASSWORD'],'bootstrap-secret')
        self.assertEqual(split['backend']['environment']['DB_USERNAME'],'rm_app')
        self.assertNotIn('owner-secret',json.dumps(split['backend']))
    def test_override_on_disk_holds_placeholders_never_values(self):
        import json
        text = json.dumps(self.ns['release_override']({'backend':'new-backend','frontend':'new-frontend'}))
        self.assertIn('${DB_OWNER_PASSWORD:-${DB_PASSWORD}}',text)
        self.assertIn('${DB_BACKUP_PASSWORD:-${DB_PASSWORD}}',text)
    def test_release_gives_the_backend_the_public_origin(self):
        services = self.ns['release_override']({'backend':'new-backend','frontend':'new-frontend'})['services']
        self.assertEqual(services['backend']['environment']['FRONTEND_URL'],'https://receiptmaster.org')
    def test_real_compose_applies_the_public_origin_over_whatever_the_server_holds(self):
        import json, shutil, subprocess
        if not shutil.which('docker'): self.skipTest('Docker Compose CLI is unavailable')
        override = self.work / 'release.override.json'
        override.write_text(json.dumps(self.ns['release_override']({'backend':'new-backend','frontend':'new-frontend'})))
        envfile = self.work / 'origin.env'; envfile.write_text('DB_NAME=market\nDB_USERNAME=fixture\nDB_PASSWORD=fixture\nFRONTEND_URL=http://localhost:5173\n')
        # The frozen server file omits the key entirely; the repository's file forwards it.
        for name, environment in (('frozen server file',['DB_USERNAME=${DB_USERNAME}']), ('repository file',['FRONTEND_URL=${FRONTEND_URL:-}'])):
            with self.subTest(base=name):
                base = self.work / 'origin-compose.json'
                base.write_text(json.dumps({'services': {'backend': {'image':'old-backend','environment':environment}, 'frontend': {'image':'old-frontend'}, 'postgres': {'image':'postgres:15-alpine'}, 'db-backup': {'image':'market-db-backup'}}, 'networks': {'marketflow-network': {}}}))
                command = ['docker','compose','--project-name','origin-fixture','--project-directory',str(self.work),'--env-file',str(envfile),'-f',str(base),'-f',str(override),'config','--format','json']
                resolved = json.loads(subprocess.run(command,capture_output=True,check=True).stdout)['services']
                self.assertEqual(resolved['backend']['environment']['FRONTEND_URL'],'https://receiptmaster.org')
    def test_migration_command_uses_validated_compose_without_raw_env_source(self):
        compose = ['docker','compose','--env-file','recorded-custom.env','-f','original.yml','-f','release.override.json']
        command = self.ns['migration_command'](compose, 'NODE_CODE', 'a' * 32, 'rm_app', check_only=True)
        self.assertEqual(command[:len(compose)], compose)
        self.assertEqual(command[-3:], ['migrate','-e','NODE_CODE'])
        self.assertIn('RELEASE_CHECK_ONLY=true', command)
        self.assertIn('RELEASE_APP_ROLE=rm_app', command)
        self.assertIn('RELEASE_EXPECTED_DATABASE_IDENTITY=' + 'a' * 32, command)
        self.assertEqual(command.count('--env-file'), 1)
        self.assertFalse(any(key in value for value in command for key in ('DB_HOST=','DB_PORT=','DB_USERNAME=','DB_PASSWORD=')))
    def test_migration_actual_node_seam_rejects_wrong_database_before_apply(self):
        import json, subprocess
        code = SCRIPT.split('migration_code = r"""',1)[1].split('"""',1)[0]
        harness = """const vm=require('node:vm');let applied=false;const state={env:{RELEASE_EXPECTED_DATABASE_IDENTITY:'expected'}};
const runner={connect:async()=>{},query:async sql=>sql.includes('AS identity')?[{identity:'wrong'}]:[],release:async()=>{}};
let options;const ds={options:{extra:{}},setOptions:value=>{options=value},initialize:async()=>{},createQueryRunner:()=>runner,destroy:async()=>{},runMigrations:async()=>{applied=true}};
(async()=>{await vm.runInNewContext(CODE,{require:()=>({default:ds}),process:state,console:{error:()=>{}}}); console.log(JSON.stringify({applied,exitCode:state.exitCode,options}))})()""".replace('CODE',json.dumps(code))
        result = subprocess.run(['node','-e',harness], capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(result.stdout), {'applied':False,'exitCode':1,'options':{'extra':{'options':'-c lock_timeout=30000 -c statement_timeout=180000'}}})
    def migration_seam(self, *, pending, missing, can_create=True, unowned=0, check_only=True):
        import json, subprocess
        code = SCRIPT.split('migration_code = r\"\"\"',1)[1].split('\"\"\"',1)[0].replace('__EXPECTED_MIGRATIONS__',json.dumps(['PendingMigration']))
        harness = """const vm=require('node:vm');let applied=false;const log=[];const state={env:{RELEASE_EXPECTED_DATABASE_IDENTITY:'expected',RELEASE_APP_ROLE:'rm_app',...(CHECK?{RELEASE_CHECK_ONLY:'true'}:{})}};
const runner={connect:async()=>{},query:async(sql,params)=>{if(sql.includes('AS identity'))return [{identity:'expected'}];if(sql.startsWith('SELECT name'))return [];if(sql.includes('has_schema_privilege'))return [{ok:CREATE}];if(sql.includes('AS unowned'))return [{unowned:UNOWNED}];if(sql.includes('AS missing')){log.push(params);return [{missing:MISSING}]}return []},release:async()=>{}};
const ds={options:{extra:{}},setOptions:()=>{},initialize:async()=>{},createQueryRunner:()=>runner,destroy:async()=>{},migrations:PENDING,runMigrations:async()=>{applied=true}};
(async()=>{await vm.runInNewContext(CODE,{require:()=>({default:ds}),process:state,console:{error:()=>{}}});console.log(JSON.stringify({applied,exitCode:state.exitCode||0,log}))})()"""
        harness = harness.replace('CODE',json.dumps(code)).replace('CHECK','true' if check_only else 'false').replace('CREATE','true' if can_create else 'false').replace('MISSING',str(missing)).replace('UNOWNED',str(unowned)).replace('PENDING',json.dumps([{'name':'PendingMigration'}] if pending else []))
        return json.loads(subprocess.run(['node','-e',harness],capture_output=True,text=True,check=True).stdout)
    def test_missing_runtime_grant_blocks_before_backup_or_apply(self):
        result = self.migration_seam(pending=False, missing=1)
        self.assertEqual((result['applied'],result['exitCode']),(False,1))
        self.assertEqual(result['log'],[['rm_app']])
    def test_clean_check_only_run_leaves_the_database_alone(self):
        result = self.migration_seam(pending=True, missing=0)
        self.assertEqual((result['applied'],result['exitCode']),(False,0))
    def test_migration_role_without_create_blocks_pending_migrations(self):
        result = self.migration_seam(pending=True, missing=0, can_create=False, check_only=False)
        self.assertEqual((result['applied'],result['exitCode']),(False,1))
    def test_migration_role_without_ownership_blocks_pending_migrations_before_backup(self):
        result = self.migration_seam(pending=True, missing=0, unowned=2)
        self.assertEqual((result['applied'],result['exitCode']),(False,1))
    def test_ownership_is_not_required_when_nothing_is_pending(self):
        result = self.migration_seam(pending=False, missing=0, unowned=2)
        self.assertEqual((result['applied'],result['exitCode']),(False,0))
    def test_runtime_grants_are_rechecked_after_apply(self):
        result = self.migration_seam(pending=True, missing=0, check_only=False)
        self.assertEqual((result['applied'],result['exitCode']),(True,0))
        self.assertEqual(len(result['log']),2)
    def test_schema_gate_and_backup_precede_migration(self):
        self.assertLess(SCRIPT.index('run_migration(check)'), SCRIPT.index("run(['docker', 'stop'"))
        self.assertLess(SCRIPT.index("backup.with_suffix('.sha256')"), SCRIPT.index('run_migration(migration)'))
        self.assertIn("pg_advisory_lock(3217891453)", SCRIPT)
        self.assertIn("pg_advisory_unlock(3217891453)", SCRIPT)
        self.assertIn("new = original + ['-f', str(override)]", SCRIPT)
        self.assertNotIn('prune', SCRIPT)
        self.assertNotIn('remove-orphans', SCRIPT)
        self.assertNotIn('migration:revert', SCRIPT)
        self.assertIn("'--file=/dev/null'", SCRIPT)

class MigrationTerminationTests(unittest.TestCase):
    def setUp(self):
        self.ns = {}; exec(compile(PREFIX, '<release>', 'exec'), self.ns)
        self.command = self.ns['migration_command'](['docker','compose'], 'CODE', 'a' * 32, 'rm_app', run_id='123-1')
    def test_failed_command_is_stopped_and_confirmed_before_original_error_returns(self):
        error = TimeoutError('original migration timeout'); calls = []; probes = [b'owned-container',b'']
        def run(args):
            calls.append(args)
            if args == self.command: raise error
            if args[1] == 'ps': return probes.pop(0)
            return b''
        self.ns['run'] = run
        with self.assertRaises(TimeoutError) as caught: self.ns['run_migration'](self.command)
        self.assertIs(caught.exception,error)
        self.assertEqual(calls[2],['docker','stop','--time','20','receiptmaster-migration-123-1-apply'])
        self.assertEqual(len(probes),0)
    def test_unconfirmed_completion_blocks_automated_rollback(self):
        def run(args):
            if args == self.command: raise TimeoutError('original migration timeout')
            raise RuntimeError('Docker unavailable')
        self.ns['run'] = run
        with self.assertRaises(self.ns['MigrationCompletionUnknown']): self.ns['run_migration'](self.command)
        self.assertIn('stopped and not isinstance(deploy_error, MigrationCompletionUnknown)',SCRIPT)
    def printed_by(self, run):
        import io
        self.ns['run'] = run
        raw = io.BytesIO(); stream = io.TextIOWrapper(raw, encoding='ascii')
        try:
            with self.ns['contextlib'].redirect_stdout(stream): self.ns['run_migration'](self.command)
        finally:
            stream.flush()
        return raw.getvalue().decode('ascii')
    def test_completed_migration_prints_only_the_backfill_warning(self):
        output = ('[Nest] 1 - 10/30/2026, 12:00:00\u202fPM WARN [BackfillOrderItemUnitCost] 2 line(s) stay unknown\n'
                  'DB_PASSWORD=synthetic-secret\npostgres://fixture:synthetic-secret@db/app\n').encode() + b'\xff binary\n'
        printed = self.printed_by(lambda args: output)
        self.assertIn('[BackfillOrderItemUnitCost] 2 line(s) stay unknown', printed)
        self.assertEqual(len(printed.splitlines()), 1)
        self.assertNotIn('synthetic-secret', printed)
    def test_completed_migration_without_the_warning_prints_nothing(self):
        self.assertEqual(self.printed_by(lambda args: b'DB_PASSWORD=synthetic-secret\n'), '')
    def test_failing_migration_prints_nothing_and_fails_as_before(self):
        error = RuntimeError('Command failed: docker compose run')
        def run(args):
            if args == self.command: raise error
            return b''
        with self.assertRaises(RuntimeError) as caught: self.printed_by(run)
        self.assertIs(caught.exception, error)

class HTTPSProbeTests(unittest.TestCase):
    def setUp(self):
        self.ns = {}; exec(compile(PREFIX, '<release>', 'exec'), self.ns)
    def test_rejects_http_foreign_origin_and_credentials_before_network(self):
        with patch.object(self.ns['urllib'].request, 'build_opener') as opener:
            for url in ('http://receiptmaster.org/', 'https://other.example/', 'https://user@receiptmaster.org/', 'https://receiptmaster.org:444/'):
                with self.assertRaisesRegex(RuntimeError, 'trusted HTTPS'): self.ns['open_https'](url)
            opener.assert_not_called()
    def test_https_to_http_or_other_redirects_are_rejected(self):
        handler = self.ns['RejectRedirects']()
        for destination in ('http://receiptmaster.org/', 'https://other.example/', 'https://receiptmaster.org/another'):
            with self.assertRaisesRegex(RuntimeError, 'reject redirects'):
                handler.redirect_request(None,None,302,'Found',{},destination)
    def test_changed_final_response_origin_is_rejected(self):
        from unittest.mock import Mock
        response = Mock(); response.geturl.return_value = 'http://receiptmaster.org/health'
        opener = Mock(); opener.open.return_value = response
        with patch.object(self.ns['urllib'].request, 'build_opener', return_value=opener):
            with self.assertRaisesRegex(RuntimeError, 'origin changed'): self.ns['open_https']('https://receiptmaster.org/health')
        response.close.assert_called_once()
    def test_probe_uses_explicit_release_user_agent(self):
        from unittest.mock import Mock
        response = Mock(); response.geturl.return_value = 'https://receiptmaster.org/health'
        opener = Mock(); opener.open.return_value = response
        with patch.object(self.ns['urllib'].request, 'build_opener', return_value=opener):
            self.ns['open_https']('https://receiptmaster.org/health')
        request = opener.open.call_args.args[0]
        self.assertIsInstance(request,self.ns['urllib'].request.Request)
        self.assertEqual(request.full_url,'https://receiptmaster.org/health')
        self.assertEqual(request.get_header('User-agent'),'ReceiptMaster-Release-Check/1.0')
    def test_http_403_still_rejects_the_release_probe(self):
        from unittest.mock import Mock
        from urllib.error import HTTPError
        error = HTTPError('https://receiptmaster.org/health',403,'Forbidden',{},None)
        opener = Mock(); opener.open.side_effect = error
        with patch.object(self.ns['urllib'].request, 'build_opener', return_value=opener):
            with self.assertRaises(HTTPError) as caught: self.ns['open_https']('https://receiptmaster.org/health')
        self.assertIs(caught.exception,error)
    def test_valid_origin_uses_redirect_rejecting_handler(self):
        from unittest.mock import Mock
        response = Mock(); response.geturl.return_value = 'https://receiptmaster.org/health'
        opener = Mock(); opener.open.return_value = response
        with patch.object(self.ns['urllib'].request, 'build_opener', return_value=opener) as build:
            self.assertIs(self.ns['open_https']('https://receiptmaster.org/health'),response)
        self.assertIsInstance(build.call_args.args[0],self.ns['RejectRedirects'])

class RollbackFailureTests(unittest.TestCase):
    def setUp(self):
        import io
        self.ns = {}; exec(compile(PREFIX, '<release>', 'exec'), self.ns)
        self.space = tempfile.TemporaryDirectory(dir=pathlib.Path(__file__).resolve().parent)
        self.release = pathlib.Path(self.space.name)
        self.old = {'backend': 'sha256:old-backend', 'frontend': 'sha256:old-frontend'}
        self.commands = []; self.urls = []; self.output = io.StringIO()
        self.ns['run'] = lambda args: self.commands.append(args) or b''
        self.ns['discover'] = lambda service: {'Image': self.old[service]}
        self.ns['health'] = lambda url: self.urls.append(url)
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self): return b'<script type="module" src="/assets/old.js"></script>'
        self.urlpatch = patch.dict(self.ns, {'open_https': lambda url, **kwargs: self.urls.append(url) or Response()})
        self.urlpatch.start()
    def tearDown(self):
        self.urlpatch.stop(); self.space.cleanup()
    def fail_release(self):
        error = RuntimeError('original deployment failed')
        with self.assertRaises(RuntimeError) as caught:
            with self.ns['contextlib'].redirect_stdout(self.output):
                self.ns['rollback_after_failure'](error, True, ['docker', 'compose'], self.release, self.old)
        self.assertIs(caught.exception, error)
    def test_successful_rollback_verifies_old_images_api_root_and_js_but_release_fails(self):
        self.fail_release()
        self.assertEqual(len(self.commands), 2)
        self.assertTrue(all('--no-deps' in command and '--force-recreate' in command for command in self.commands))
        self.assertIn('ROLLBACK VERIFIED', self.output.getvalue())
        self.assertTrue(any('/api/v1/health' in url for url in self.urls))
        self.assertTrue(any('/assets/old.js' in url for url in self.urls))
        self.assertFalse(any('release.json' in url for url in self.urls))
    def test_failed_rollback_command_preserves_original_deploy_error(self):
        self.ns['run'] = lambda args: (_ for _ in ()).throw(RuntimeError('rollback command failed'))
        self.fail_release()
        self.assertIn('ROLLBACK HEALTH FAILED', self.output.getvalue())
        self.assertNotIn('ROLLBACK VERIFIED', self.output.getvalue())
    def test_wrong_old_image_blocks_rollback_acceptance_with_bounded_retry(self):
        self.ns['discover'] = lambda service: {'Image': 'sha256:wrong'}
        clock = [0]
        self.ns['time'] = type('Clock', (), {'monotonic': staticmethod(lambda: clock[0]), 'sleep': staticmethod(lambda seconds: clock.__setitem__(0, clock[0] + seconds))})
        self.fail_release()
        self.assertGreaterEqual(clock[0], 120)
        self.assertLessEqual(clock[0], 123)
        self.assertIn('ROLLBACK HEALTH FAILED', self.output.getvalue())
    def test_unhealthy_api_never_claims_rollback_success(self):
        self.ns['health'] = lambda url: (_ for _ in ()).throw(RuntimeError('API degraded'))
        clock = [0]
        self.ns['time'] = type('Clock', (), {'monotonic': staticmethod(lambda: clock[0]), 'sleep': staticmethod(lambda seconds: clock.__setitem__(0, clock[0] + seconds))})
        self.fail_release()
        self.assertIn('ROLLBACK HEALTH FAILED', self.output.getvalue())

class ImageRetentionTests(unittest.TestCase):
    OLD = {'backend': 'sha256:backend-c', 'frontend': 'sha256:frontend-c'}
    IMAGES = {service: 'klukvas/receiptmaster-' + service + ':' + 'd' * 40 for service in ('backend','frontend')}
    def setUp(self):
        self.ns = {}; exec(compile(PREFIX, '<release>', 'exec'), self.ns)
        self.commands = []; self.removed = []; self.timeouts = []; self.refused = set(); self.rows = []
        def run(args, **kwargs):
            self.commands.append(args); self.timeouts.append(kwargs.get('timeout'))
            if args[:3] == ['docker','image','ls']:
                return '\n'.join(' '.join(row) for row in self.rows).encode()
            if args[2] in self.refused: raise RuntimeError('Command failed: docker rmi')
            self.removed.append(args[2])
            return b''
        self.ns['run'] = run
    def release_rows(self, *digits):
        return [('klukvas/receiptmaster-' + service + ':' + digit * 40, 'sha256:' + service + '-' + digit) for digit in digits for service in ('backend','frontend')]
    def rollback_rows(self, run_id, digit):
        return [('receiptmaster-rollback-' + service + ':' + run_id, 'sha256:' + service + '-' + digit) for service in ('backend','frontend')]
    def chain(self, *digits):
        return ['/opt/market/market/docker-compose.production.yml'] + ['/opt/market/releases/' + digit * 40 + '-' + str(number) + '-1/release.override.json' for number, digit in enumerate(digits, 1)]
    def refs(self, rows): return [row[0] for row in rows]
    def clean(self, configs, old=None):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.ns['remove_stale_images'](configs, 'klukvas', '4-1', self.IMAGES, old or self.OLD)
        return output.getvalue()
    def test_only_images_older_than_the_retained_releases_are_removed(self):
        self.rows = self.release_rows('a','b','c','d') + self.rollback_rows('2-1','a') + self.rollback_rows('3-1','b') + self.rollback_rows('4-1','c')
        output = self.clean(self.chain('a','b','c','d'))
        self.assertCountEqual(self.removed, self.refs(self.release_rows('a') + self.rollback_rows('2-1','a')))
        self.assertIn('removed 4 of 4', output)
    def test_fewer_releases_than_retained_removes_nothing(self):
        self.rows = self.release_rows('c','d') + self.rollback_rows('4-1','c')
        self.assertIn('removed 0 of 0', self.clean(self.chain('c','d')))
        self.assertEqual(self.removed, [])
    def test_rollback_pair_outside_the_retained_releases_survives_with_all_its_tags(self):
        self.rows = self.release_rows('a','c','d') + self.rollback_rows('4-1','c')
        self.clean(self.chain('d'))
        self.assertCountEqual(self.removed, self.refs(self.release_rows('a')))
    def test_rollback_tags_of_this_run_are_retained_even_if_ids_do_not_match(self):
        self.rows = self.release_rows('a','c','d') + self.rollback_rows('4-1','c')
        self.clean(self.chain('d'), old={'backend': 'sha256:other-backend', 'frontend': 'sha256:other-frontend'})
        self.assertCountEqual(self.removed, self.refs(self.release_rows('a')))
    def test_captured_old_pair_survives_by_id_without_a_rollback_tag(self):
        self.rows = self.release_rows('a','c','d')
        self.clean(self.chain('d'))
        self.assertCountEqual(self.removed, self.refs(self.release_rows('a')))
    def test_failed_release_takes_no_retention_slot(self):
        self.rows = self.release_rows('a','b','c','d','e')
        self.clean(self.chain('a','b','c','d'))
        self.assertCountEqual(self.removed, self.refs(self.release_rows('a','e')))
    def test_rolled_back_release_in_the_chain_takes_no_retention_slot(self):
        self.rows = self.release_rows('a','b','c','d','e')
        configs = self.chain('a','b','c')
        self.clean(configs + ['/opt/market/releases/' + 'e' * 40 + '-8-1/rollback.override.json', '/opt/market/releases/' + 'd' * 40 + '-9-1/release.override.json'])
        self.assertCountEqual(self.removed, self.refs(self.release_rows('a','e')))
    def test_redeployed_sha_counts_once(self):
        self.rows = self.release_rows('a','b','c','d')
        self.clean(self.chain('a','b','c','d','d'))
        self.assertCountEqual(self.removed, self.refs(self.release_rows('a')))
    def test_unrecognized_chain_entries_are_ignored(self):
        configs = ['/opt/market/market/docker-compose.production.yml', '/opt/market/releases/not-a-release/release.override.json', '/opt/market/releases/' + 'd' * 40 + '-9-1/release.override.json']
        self.assertEqual(self.ns['released_shas'](configs), ['d' * 40])
    def test_other_images_are_out_of_reach(self):
        others = [('postgres:15-alpine','sha256:postgres'), ('redis:7-alpine','sha256:redis'), ('market-db-backup:latest','sha256:backup'), ('market_db-backup:latest','sha256:backup2'),
                  ('<none>:<none>','sha256:dangling'), ('klukvas/receiptmaster-backend:<none>','sha256:digest-only'), ('klukvas/receiptmaster-backend:latest','sha256:backend-a'), ('klukvas/receiptmaster-backend:' + 'A' * 40,'sha256:upper'),
                  ('klukvas/receiptmaster-backend-canary:' + 'a' * 40,'sha256:canary'), ('someone/receiptmaster-backend:' + 'a' * 40,'sha256:foreign'), ('prefix/klukvas/receiptmaster-backend:' + 'a' * 40,'sha256:nested'),
                  ('receiptmaster-rollback-backend:latest','sha256:rollback-latest'), ('receiptmaster-rollback-postgres:1-1','sha256:rollback-postgres')]
        self.rows = others + self.release_rows('a','b','c','d')
        self.clean(self.chain('a','b','c','d'))
        self.assertCountEqual(self.removed, self.refs(self.release_rows('a')))
    def test_removal_is_an_explicit_rmi_without_force(self):
        self.rows = self.release_rows('a','d')
        self.clean(self.chain('a','b','c','d'))
        self.assertEqual(self.commands[0][:3], ['docker','image','ls'])
        self.assertEqual(self.commands[1:], [['docker','rmi',ref] for ref in self.refs(self.release_rows('a'))])
    def test_refused_removal_warns_and_the_rest_continue(self):
        self.rows = self.release_rows('a','d')
        refused, other = self.refs(self.release_rows('a'))
        self.refused = {refused}
        output = self.clean(self.chain('a','b','c','d'))
        self.assertEqual(self.removed, [other])
        self.assertIn('WARNING: image cleanup could not remove ' + refused, output)
        self.assertIn('removed 1 of 2', output)
    def test_failed_listing_only_warns(self):
        def run(args, **kwargs):
            self.commands.append(args)
            raise RuntimeError('Command failed: docker image ls')
        self.ns['run'] = run
        self.assertIn('WARNING: image cleanup skipped: Command failed: docker image ls', self.clean(self.chain('a','d')))
        self.assertEqual(len(self.commands), 1)
    def test_malformed_listing_removes_nothing(self):
        self.rows = self.release_rows('a','d') + [('unexpected-row',)]
        self.assertIn('WARNING: image cleanup skipped', self.clean(self.chain('a','b','c','d')))
        self.assertEqual(self.removed, [])
    def test_listing_without_the_released_pair_removes_nothing(self):
        self.rows = self.release_rows('a','b')
        self.assertIn('WARNING: image cleanup skipped: Released images', self.clean(self.chain('a','b','c','d')))
        self.assertEqual(self.removed, [])
    def test_time_limit_bounds_each_removal_and_the_whole_cleanup(self):
        self.rows = self.release_rows('a','d','e')
        clock = [0]
        self.ns['time'] = types.SimpleNamespace(monotonic=lambda: clock[0])
        unlimited = self.ns['run']
        def slow_run(args, **kwargs):
            clock[0] += 70
            return unlimited(args, **kwargs)
        self.ns['run'] = slow_run
        output = self.clean(self.chain('a','b','c','d'))
        self.assertEqual(self.timeouts, [120, 50])
        self.assertIn('WARNING: image cleanup reached its time limit', output)
        self.assertIn('removed 1 of 4', output)
    def test_real_compose_resolves_no_image_from_an_older_override(self):
        import shutil, subprocess
        if not shutil.which('docker'): self.skipTest('Docker Compose CLI is unavailable')
        release_override = self.ns['release_override']
        removed_id = 'sha256:' + 'e' * 64
        layers = [
            {'services': {'backend': {'image':'base/backend:gone','environment':{'DB_USERNAME':'${DB_USERNAME}'}}, 'frontend': {'image':'base/frontend:gone'}, 'postgres': {'image':'postgres:15-alpine'}, 'db-backup': {'image':'market-db-backup'}}, 'networks': {'marketflow-network': {}}},
            release_override({'backend':'old/backend:gone','frontend':'old/frontend:gone'}),
            {'services': {'backend': {'image':removed_id}, 'frontend': {'image':removed_id}}},
            release_override({'backend':'new/backend:live','frontend':'new/frontend:live'}),
        ]
        with tempfile.TemporaryDirectory(dir=pathlib.Path(__file__).resolve().parent) as space:
            work = pathlib.Path(space)
            (work / 'chain.env').write_text('DB_NAME=market\nDB_USERNAME=fixture\nDB_PASSWORD=fixture\n')
            files = sum((['-f', str(work / (str(index) + '.json'))] for index in range(len(layers))), [])
            for index, layer in enumerate(layers): (work / (str(index) + '.json')).write_text(json.dumps(layer))
            command = ['docker','compose','--project-name','chain-fixture','--project-directory',str(work),'--env-file',str(work / 'chain.env')] + files + ['--profile','release-migrate','config','--format','json']
            resolved = subprocess.run(command,capture_output=True,check=True).stdout.decode()
        self.assertNotIn('gone', resolved)
        self.assertNotIn(removed_id, resolved)
        services = json.loads(resolved)['services']
        self.assertEqual((services['backend']['image'],services['frontend']['image'],services['migrate']['image']),('new/backend:live','new/frontend:live','new/backend:live'))

class ReleaseFlowCleanupTests(unittest.TestCase):
    """Runs the script's real main flow, so these prove when cleanup runs rather than where it is written."""
    SHA = 'd' * 40
    RUN = '4-1'
    OLD = {'backend': 'sha256:old-backend', 'frontend': 'sha256:old-frontend'}
    def setUp(self):
        self.space = tempfile.TemporaryDirectory(dir=pathlib.Path(__file__).resolve().parent)
        root = pathlib.Path(self.space.name)
        self.work = root / 'market'; self.work.mkdir()
        self.release = root / 'releases' / (self.SHA + '-' + self.RUN); self.release.mkdir(parents=True)
        (self.release / 'release.sha').write_text(self.SHA + '\n')
        self.override = self.release / 'release.override.json'
        self.earlier = root / 'releases' / ('a' * 40 + '-1-1'); self.earlier.mkdir()
        (self.earlier / 'release.override.json').write_text('{}')
        self.ns = {'__file__': 'deploy-production.sh'}; exec(compile(PREFIX, '<release>', 'exec'), self.ns)
        self.commands = []; self.fails = lambda args: False; self.lock_held_during_cleanup = None
        self.running = dict(self.OLD); self.public_sha = self.SHA; self.output = ''
        self.listing = '\n'.join(['klukvas/receiptmaster-backend:' + self.SHA + ' sha256:new', 'klukvas/receiptmaster-frontend:' + self.SHA + ' sha256:new', 'klukvas/receiptmaster-backend:' + 'f' * 40 + ' sha256:stale']).encode()
        def container(name, env=()): return {'Id': name, 'Image': self.OLD.get(name, 'sha256:' + name), 'Config': {'Env': list(env)}}
        state = (container('backend', ['DB_USERNAME=rm_app']), container('frontend'), container('postgres'), container('redis'), 'existing', self.work, [str(self.earlier / 'release.override.json')], [self.work / '.env'], 'existing-network', [], 'a' * 32)
        class Response:
            status = 200
            def __init__(self, body): self.body = body
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self): return self.body
        def open_https(url, **kwargs):
            if 'billing/config' in url: return Response(b'{"billingEnabled": false}')
            if 'release.json' in url: return Response(json.dumps({'sha': self.public_sha, 'billingEnabled': False}).encode())
            return Response(b'<script type="module" src="/assets/app.js"></script>')
        def docker_exec(args, **kwargs):
            if args[-1].endswith('-Fc'): kwargs['stdout'].write(b'archive')
            return types.SimpleNamespace(returncode=0)
        self.ns['subprocess'] = types.SimpleNamespace(run=docker_exec, PIPE=-1, DEVNULL=-3)
        self.ns.update(precheck=lambda workdir, check_lock=True: state, discover=lambda service: {'Image': self.running[service]}, run=self.docker, health=lambda url: None, open_https=open_https)
    def tearDown(self): self.space.cleanup()
    def docker(self, args, **kwargs):
        self.commands.append(args)
        if self.fails(args): raise RuntimeError('Command failed: ' + ' '.join(args[:3]))
        if args[:3] == ['docker','image','inspect']:
            return json.dumps([{'Id': 'sha256:new', 'Config': {'Labels': {'org.opencontainers.image.version': self.SHA}}}]).encode()
        if args[:3] == ['docker','image','ls']:
            self.lock_held_during_cleanup = self.deploy_lock_is_held()
            return self.listing
        if 'up' in args:
            self.running[args[-1]] = 'sha256:new' if str(self.override) in args else self.OLD[args[-1]]
        return b''
    def deploy_lock_is_held(self):
        with open(self.work.parent / '.receiptmaster-deploy.lock') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return True
        return False
    def deploy(self, phase='deploy'):
        output = io.StringIO()
        try:
            with patch.object(sys, 'argv', ['-', phase, str(self.work), self.SHA, self.RUN, 'klukvas']), contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
                exec(compile(MAIN, '<release>', 'exec'), self.ns)
        finally:
            self.output = output.getvalue()
    def cleanup_commands(self):
        return [args for args in self.commands if args[:3] == ['docker','image','ls'] or args[1] == 'rmi']
    def assert_release_failed_without_cleanup(self):
        with self.assertRaises(SystemExit) as caught: self.deploy()
        self.assertEqual(caught.exception.code, 1)
        self.assertIn('RELEASE BLOCKED', self.output)
        self.assertEqual(self.cleanup_commands(), [])
    def test_verified_release_cleans_up_under_the_lock_after_deploy_pass(self):
        self.deploy()
        self.assertLess(self.output.index('DEPLOY PASS'), self.output.index('IMAGE CLEANUP: removed 1 of 1'))
        self.assertEqual(self.cleanup_commands()[-1], ['docker','rmi','klukvas/receiptmaster-backend:' + 'f' * 40])
        self.assertTrue(self.lock_held_during_cleanup)
    def test_cleanup_keeps_every_release_directory(self):
        self.deploy()
        self.assertTrue((self.earlier / 'release.override.json').is_file())
        self.assertTrue(self.override.is_file())
    def test_precheck_phase_never_cleans_up(self):
        with self.assertRaises(SystemExit) as caught: self.deploy('precheck')
        self.assertEqual(caught.exception.code, 0)
        self.assertEqual(self.commands, [])
    def test_failed_pull_never_cleans_up(self):
        self.fails = lambda args: args[1] == 'pull'
        self.assert_release_failed_without_cleanup()
    def test_failed_migration_never_cleans_up(self):
        self.fails = lambda args: '--name' in args and args[args.index('--name') + 1].endswith('-apply')
        self.assert_release_failed_without_cleanup()
        self.assertIn('ROLLBACK VERIFIED', self.output)
    def test_rolled_back_start_failure_never_cleans_up(self):
        self.fails = lambda args: 'up' in args and str(self.override) in args
        self.assert_release_failed_without_cleanup()
        self.assertIn('ROLLBACK VERIFIED', self.output)
    def test_unverified_public_release_rolls_back_without_cleanup(self):
        clock = [0]
        self.ns['time'] = types.SimpleNamespace(time=lambda: clock[0], monotonic=lambda: clock[0], sleep=lambda seconds: clock.__setitem__(0, clock[0] + seconds))
        self.public_sha = 'e' * 40
        self.assert_release_failed_without_cleanup()
        self.assertIn('ROLLBACK VERIFIED', self.output)
    def test_failed_rollback_never_cleans_up(self):
        self.fails = lambda args: 'up' in args
        self.assert_release_failed_without_cleanup()
        self.assertIn('ROLLBACK HEALTH FAILED', self.output)
    def assert_release_stayed_complete(self):
        self.deploy()
        self.assertIn('DEPLOY PASS', self.output)
        self.assertIn('WARNING: image cleanup', self.output)
        self.assertNotIn('RELEASE BLOCKED', self.output)
        self.assertNotIn('ROLLBACK', self.output)
        self.assertFalse((self.release / 'rollback.override.json').exists())
        self.assertEqual(self.running, {'backend': 'sha256:new', 'frontend': 'sha256:new'})
    def test_failed_listing_leaves_the_release_complete(self):
        self.fails = lambda args: args[:3] == ['docker','image','ls']
        self.assert_release_stayed_complete()
    def test_refused_removal_leaves_the_release_complete(self):
        self.fails = lambda args: args[1] == 'rmi'
        self.assert_release_stayed_complete()

if __name__ == '__main__': unittest.main()
