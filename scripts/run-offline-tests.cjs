// Linux CI entry point. Fail closed before loading PR test code if isolation
// or privilege dropping was not applied by the workflow.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
assert.equal(process.platform, 'linux');
assert.notEqual(process.getuid(), 0, 'Tests must not run as root');
assert.notEqual(process.getgid(), 0, 'Tests must not use the root group');
const status = fs.readFileSync('/proc/self/status', 'utf8');
for (const name of ['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb']) {
  assert.match(status, new RegExp('^' + name + ':\\s+0+$', 'm'), name + ' must be empty');
}
assert.match(status, /^NoNewPrivs:\s+1$/m, 'Privilege escalation must be disabled');
const hostNamespace = process.argv[2];
assert.match(hostNamespace || '', /^net:\[\d+\]$/);
assert.notEqual(fs.readlinkSync('/proc/self/ns/net'), hostNamespace, 'Must use an isolated network namespace');
const interfaces = fs.readdirSync('/sys/class/net');
assert.deepEqual(interfaces, ['lo'], 'No external network interfaces may be present');
console.log('# isolation: non-root, zero capabilities, NoNewPrivs=1, separate network namespace');
const files = fs.readdirSync('tests').filter(name => name.endsWith('.test.cjs')).sort().map(name => 'tests/' + name);
assert.ok(files.length, 'Test files must exist');
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
