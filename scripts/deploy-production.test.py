"""Execute production precheck seams with fake Docker; never contacts production."""
import pathlib
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).with_name('deploy-production.sh').read_text().split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
PREFIX = SCRIPT.split('phase, workdir, sha, run_id, registry =', 1)[0]

class ReleasePrecheckTests(unittest.TestCase):
    def setUp(self):
        self.space = tempfile.TemporaryDirectory(dir=pathlib.Path(__file__).resolve().parent)
        self.work = pathlib.Path(self.space.name)
        (self.work / '.env').write_text('SYNTHETIC_TEST_ONLY=1\n')
        config = self.work / 'compose.yml'; config.write_text('services: {}\n')
        labels = {'com.docker.compose.config-hash': 'a' * 64, 'com.docker.compose.project': 'existing', 'com.docker.compose.project.working_dir': str(self.work), 'com.docker.compose.project.config_files': str(config)}
        self.containers = {service: {'Id': service, 'Image': 'sha256:old-' + service, 'Config': {'Labels': labels.copy(), 'Env': ['DB_NAME=fixture','DB_USERNAME=fixture'] if service == 'backend' else ['POSTGRES_DB=fixture','POSTGRES_USER=fixture']}, 'Mounts': [{}], 'NetworkSettings': {'Networks': {'existing-network': {}}, 'Ports': {'80/tcp': [{}]}}} for service in ('backend', 'frontend', 'postgres', 'redis')}
        self.ns = {}; exec(compile(PREFIX, '<release>', 'exec'), self.ns)
        self.history = [name for name in self.ns['KNOWN_MIGRATIONS'] if name != self.ns['EXPECTED_MIGRATION']]
        self.calls = []
        self.image_env = {'backend': [], 'frontend': []}
        def run(args, **kwargs):
            import json
            self.calls.append(args)
            if args[-2:] == ['--hash','backend,frontend']:
                return ('backend ' + 'a' * 64 + '\nfrontend ' + 'a' * 64 + '\n').encode()
            if args[1:3] == ['image','inspect']:
                service = next(key for key in self.image_env if args[3] == self.containers[key]['Image'])
                return json.dumps([{'Config': {'Env': self.image_env[service]}}]).encode()
            return json.dumps({'services': {service: {'environment': dict(item.split('=',1) for item in self.containers[service]['Config']['Env'])} for service in ('backend','frontend')}}).encode() if args[1] == 'compose' else b'a' * 32 if args[1:3] == ['exec','backend'] else b'[]'
        def sql(pg, statement):
            if 'AS identity' in statement: return 'a' * 32
            if 'has_schema_privilege' in statement: return 't'
            if 'current_user' in statement: return 'fixture|f|f'
            if 'to_regclass' in statement: return 't'
            if 'SELECT name' in statement: return '\n'.join(self.history)
            if 'pg_policies' in statement: return '0'
            if 'pg_database_size' in statement: return '1024'
            if 'has_schema_privilege' in statement: return 't'
            raise AssertionError(statement)
        self.ns.update(discover=lambda service: self.containers[service], run=run, sql=sql, health=lambda url: None)
    def tearDown(self): self.space.cleanup()
    def check(self): return self.ns['precheck'](str(self.work))
    def test_precheck_preserves_env_and_has_no_mutating_commands(self):
        before = (self.work / '.env').read_bytes(); state = self.check()
        self.assertEqual(state[4], 'existing'); self.assertEqual((self.work / '.env').read_bytes(), before)
        self.assertTrue(all(args[1:3] in (['image','inspect'], ['exec','postgres'], ['exec','backend']) or args[1] == 'compose' for args in self.calls))
        self.assertTrue(all('pull' not in args and 'stop' not in args and 'run' not in args for args in self.calls))
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
    def test_baseline_health_failure_blocks(self):
        self.ns['health'] = lambda url: (_ for _ in ()).throw(RuntimeError('baseline down'))
        with self.assertRaisesRegex(RuntimeError, 'baseline down'): self.check()
    def test_wrong_runtime_instance_blocks_before_mutation(self):
        original_run = self.ns['run']
        self.ns['run'] = lambda args, **kwargs: b'b' * 32 if args[1:3] == ['exec','backend'] else original_run(args, **kwargs)
        with self.assertRaisesRegex(RuntimeError, 'backed-up database instance'): self.check()
        self.assertFalse(any('stop' in args or 'pull' in args or 'run' in args for args in self.calls))
    def test_invalid_runtime_password_connection_blocks(self):
        original_run = self.ns['run']
        def run(args, **kwargs):
            if args[1:3] == ['exec','backend']: raise RuntimeError('Connection failed')
            return original_run(args, **kwargs)
        self.ns['run'] = run
        with self.assertRaisesRegex(RuntimeError, 'Connection failed'): self.check()
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
        }}))
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
            scope = {'os':os,'json':json,'project':'context-fixture','work':self.work,'envfiles':[envfile],'configs':[str(config)],'release':self.work,'sha':'b'*40,'registry':'new-registry','old_images':{'backend':'old-backend','frontend':'old-frontend'}}
            exec(compile(ast.Module(body=selected,type_ignores=[]),'<actual-release-command-construction>','exec'),scope)
            after = resolve(scope['original'])
            deployed = resolve(scope['new'])
            self.assertEqual(before,after)
            self.assertEqual(deployed['services']['backend']['volumes'],before['services']['backend']['volumes'])
            self.assertEqual(deployed['services']['backend']['environment']['CUSTOM_RELEASE_CONTEXT'],'checked-original')
            self.assertEqual(deployed['services']['backend']['image'],'new-registry/receiptmaster-backend:'+'b'*40)
            self.assertEqual(deployed['services']['frontend']['image'],'new-registry/receiptmaster-frontend:'+'b'*40)
    def test_migration_command_uses_validated_compose_without_raw_env_source(self):
        compose = ['docker','compose','--env-file','recorded-custom.env','-f','original.yml','-f','release.override.json']
        command = self.ns['migration_command'](compose, 'NODE_CODE', 'a' * 32, check_only=True)
        self.assertEqual(command[:len(compose)], compose)
        self.assertEqual(command[-3:], ['backend','-e','NODE_CODE'])
        self.assertIn('RELEASE_CHECK_ONLY=true', command)
        self.assertIn('RELEASE_EXPECTED_DATABASE_IDENTITY=' + 'a' * 32, command)
        self.assertEqual(command.count('--env-file'), 1)
        self.assertFalse(any('DB_HOST=' in value or 'DB_PORT=' in value for value in command))
    def test_migration_actual_node_seam_rejects_wrong_database_before_apply(self):
        import json, subprocess
        code = SCRIPT.split('migration_code = r"""',1)[1].split('"""',1)[0]
        harness = """const vm=require('node:vm');let applied=false;const state={env:{RELEASE_EXPECTED_DATABASE_IDENTITY:'expected'}};
const runner={connect:async()=>{},query:async sql=>sql.includes('AS identity')?[{identity:'wrong'}]:[],release:async()=>{}};
let options;const ds={options:{extra:{}},setOptions:value=>{options=value},initialize:async()=>{},createQueryRunner:()=>runner,destroy:async()=>{},runMigrations:async()=>{applied=true}};
(async()=>{await vm.runInNewContext(CODE,{require:()=>({default:ds}),process:state,console:{error:()=>{}}}); console.log(JSON.stringify({applied,exitCode:state.exitCode,options}))})()""".replace('CODE',json.dumps(code))
        result = subprocess.run(['node','-e',harness], capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(result.stdout), {'applied':False,'exitCode':1,'options':{'extra':{'options':'-c lock_timeout=30000 -c statement_timeout=180000'}}})
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
        self.command = self.ns['migration_command'](['docker','compose'], 'CODE', 'a' * 32, run_id='123-1')
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

if __name__ == '__main__': unittest.main()
