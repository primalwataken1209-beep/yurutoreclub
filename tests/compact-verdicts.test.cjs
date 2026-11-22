// Unit tests for the verdict rules of tests-pg/compact-concurrency.cjs (pure functions; no database, no network).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../tests-pg/compact-verdicts.cjs');
const begun = { ok: true, value: { user_id: 'u', generation: 3 } };

test('K1: compaction then begin: begin takes the lease; log is the summary; version moved by 2', () => {
  const g = { control: true, blocked: true, compact: 'compacted', begin: begun, logLen: 1, summary: true, versionDelta: 2 };
  assert.equal(V.k1(g), 'pass');
  assert.equal(V.k1({ ...g, blocked: false }), 'inconclusive');
  assert.equal(V.k1({ ...g, control: false }), 'inconclusive');
  assert.equal(V.k1({ ...g, begin: { ok: true, value: { refused: 'busy' } } }), 'fail');
  assert.equal(V.k1({ ...g, begin: { ok: true, value: { refused: 'busy', generation: 3 } } }), 'fail');
  assert.equal(V.k1({ ...g, begin: { ok: false, message: 'deadlock' } }), 'fail');
  assert.equal(V.k1({ ...g, compact: 'not_eligible' }), 'fail');
  assert.equal(V.k1({ ...g, logLen: 2 }), 'fail');
  assert.equal(V.k1({ ...g, summary: false }), 'fail');
  assert.equal(V.k1({ ...g, versionDelta: 1 }), 'fail');
});
test('K2: begin then compaction: compaction skipped_changed; log untouched', () => {
  const g = { control: true, blocked: true, begin: begun, compact: { ok: true, result: 'skipped_changed' }, logLenBefore: 2, logLen: 2, summary: false };
  assert.equal(V.k2(g), 'pass');
  assert.equal(V.k2({ ...g, blocked: false }), 'inconclusive');
  assert.equal(V.k2({ ...g, compact: { ok: true, result: 'compacted' }, logLen: 1, summary: true }), 'fail', 'compacted a job a sweep just took');
  assert.equal(V.k2({ ...g, compact: { ok: true, result: 'not_eligible' } }), 'fail', 'must be the version check');
  assert.equal(V.k2({ ...g, compact: { ok: false, message: 'x' } }), 'fail');
  assert.equal(V.k2({ ...g, logLen: 1 }), 'fail');
  assert.equal(V.k2({ ...g, begin: { ok: true, value: { refused: 'busy' } } }), 'fail');
});
test('K3: finish then compaction: compaction skipped_changed; the new sweep entry is kept', () => {
  const g = { control: true, blocked: true, finish: { ok: true, value: true }, compact: { ok: true, result: 'skipped_changed' }, logLenBefore: 2, logLen: 3, lastIsSweep: true };
  assert.equal(V.k3(g), 'pass');
  assert.equal(V.k3({ ...g, control: undefined }), 'inconclusive');
  assert.equal(V.k3({ ...g, logLen: 1, lastIsSweep: false, compact: { ok: true, result: 'compacted' } }), 'fail', 'newest entry lost');
  assert.equal(V.k3({ ...g, logLen: 2 }), 'fail');
  assert.equal(V.k3({ ...g, lastIsSweep: false }), 'fail');
  assert.equal(V.k3({ ...g, finish: { ok: true, value: false } }), 'fail');
});
test('K4: compaction during a running sweep: not_eligible lease; finish records; nothing compacted', () => {
  const g = { control: true, blocked: true, compact: { ok: true, result: 'not_eligible', detail: 'lease' }, finish: { ok: true, value: true }, summary: false };
  assert.equal(V.k4(g), 'pass');
  assert.equal(V.k4({ ...g, blocked: false }), 'inconclusive');
  assert.equal(V.k4({ ...g, compact: { ok: true, result: 'compacted' }, summary: true }), 'fail');
  assert.equal(V.k4({ ...g, compact: { ok: true, result: 'not_eligible', detail: 'not_quiet' } }), 'fail', 'must be refused for the lease');
  assert.equal(V.k4({ ...g, finish: { ok: false, message: 'x' } }), 'fail');
  assert.equal(V.k4({ ...g, finish: { ok: true, value: false } }), 'fail', 'the running sweep could not record');
  assert.equal(V.k4({ ...g, summary: true }), 'fail');
});
