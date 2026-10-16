// Linux CI entry point. Fail closed before loading PR test code if isolation
// or privilege dropping was not applied by the workflow.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
assert.equal(process.platform, 'linux');
assert.equal(process.getuid(), 65534, 'Tests must use the dedicated container UID');
assert.equal(process.getgid(), 65534, 'Tests must use the dedicated container GID');
assert.deepEqual(Object.keys(process.env).filter(key => /^(GITHUB_|RUNNER_)/.test(key)), [], 'Runner environment must not be inherited');
assert.equal(fs.existsSync('/var/run/docker.sock'), false, 'Docker socket must not be exposed');
assert.throws(() => fs.writeFileSync('/workspace/.offline-write-probe-' + process.pid, 'probe', { flag: 'wx' }), error => error.code === 'EROFS', 'Workspace must be mounted read-only');
const status = fs.readFileSync('/proc/self/status', 'utf8');
for (const name of ['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb']) {
  assert.match(status, new RegExp('^' + name + ':\\s+0+$', 'm'), name + ' must be empty');
}
assert.match(status, /^NoNewPrivs:\s+1$/m, 'Privilege escalation must be disabled');
const hostNamespace = process.argv[2];
assert.match(hostNamespace || '', /^net:\[\d+\]$/);
assert.notEqual(fs.readlinkSync('/proc/self/ns/net'), hostNamespace, 'Must use an isolated network namespace');
// sysfs can retain the host mount's view after unshare; /proc/self/net
// reports the interfaces in this process's current network namespace.
const interfaces = [...fs.readFileSync('/proc/self/net/dev', 'utf8').matchAll(/^\s*([^\s:]+):/gm)].map(match => match[1]).sort();
assert.deepEqual(interfaces, ['lo'], 'No external network interfaces may be present');
console.log('# isolation: dedicated UID, read-only workspace, no runner environment or Docker socket, zero capabilities, NoNewPrivs=1, separate network namespace');
// Required tests come from the trusted checkout, while cwd stays /workspace:
// all application, SQL and Edge Function inputs are the exact PR tree.
const testDirectory = path.resolve(__dirname, '../tests');
const files = fs.readdirSync(testDirectory).filter(name => name.endsWith('.test.cjs')).sort().map(name => path.join(testDirectory, name));
assert.ok(files.length, 'Test files must exist');
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
