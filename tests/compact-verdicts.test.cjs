// Unit tests for the verdict rules of tests-pg/compact-concurrency.cjs (pure functions; no database, no network).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../tests-pg/compact-verdicts.cjs');
const begun = { ok: true, value: { user_id: 'u', generation: 3 } };
const L2 = ['{"to":"STORAGE_DELETING"}', '{"to":"AWAITING_ASSURANCE"}'];
const SWEEP = '{"at":"t","sweep":true,"v":2,"ok":true}';

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
test('K2: begin (no refusal) then compaction: skipped_changed; the log is exactly the same entries', () => {
  const g = { control: true, blocked: true, begin: begun, compact: { ok: true, result: 'skipped_changed' }, logBefore: L2, logAfter: [...L2], summary: false };
  assert.equal(V.k2(g), 'pass');
  assert.equal(V.k2({ ...g, blocked: false }), 'inconclusive');
  assert.equal(V.k2({ ...g, begin: { ok: true, value: { generation: 3, user_id: 'u', refused: 'busy' } } }), 'fail', 'a refusal is not a begin');
  assert.equal(V.k2({ ...g, begin: { ok: true, value: { refused: 'busy' } } }), 'fail');
  assert.equal(V.k2({ ...g, compact: { ok: true, result: 'compacted' }, logAfter: ['{"compacted":true}'], summary: true }), 'fail');
  assert.equal(V.k2({ ...g, compact: { ok: true, result: 'not_eligible' } }), 'fail', 'must be the version check');
  assert.equal(V.k2({ ...g, compact: { ok: false, message: 'x' } }), 'fail');
  assert.equal(V.k2({ ...g, logAfter: [L2[0], '{"to":"CHANGED"}'] }), 'fail', 'same count but a changed entry');
  assert.equal(V.k2({ ...g, logAfter: [...L2, SWEEP] }), 'fail', 'begin must not add an entry');
});
test('K3: finish then compaction: skipped_changed; earlier entries unchanged plus exactly one sweep entry', () => {
  const g = { control: true, blocked: true, finish: { ok: true, value: true }, compact: { ok: true, result: 'skipped_changed' }, logBefore: L2, logAfter: [...L2, SWEEP], lastIsSweep: true };
  assert.equal(V.k3(g), 'pass');
  assert.equal(V.k3({ ...g, control: undefined }), 'inconclusive');
  assert.equal(V.k3({ ...g, logAfter: ['{"compacted":true}'], lastIsSweep: false, compact: { ok: true, result: 'compacted' } }), 'fail', 'newest entry lost');
  assert.equal(V.k3({ ...g, logAfter: [...L2] }), 'fail', 'no new entry');
  assert.equal(V.k3({ ...g, logAfter: ['{"to":"X"}', L2[1], SWEEP] }), 'fail', 'an earlier entry changed');
  assert.equal(V.k3({ ...g, logAfter: [...L2, SWEEP, SWEEP] }), 'fail', 'two new entries');
  assert.equal(V.k3({ ...g, lastIsSweep: false }), 'fail');
  assert.equal(V.k3({ ...g, finish: { ok: true, value: false } }), 'fail');
});
test('K4: compaction during a running sweep: not_eligible lease; finish stores one sweep entry after the unchanged earlier ones', () => {
  const g = { control: true, blocked: true, compact: { ok: true, result: 'not_eligible', detail: 'lease' }, finish: { ok: true, value: true },
    summary: false, logBefore: L2, logAfter: [...L2, SWEEP], lastIsSweep: true };
  assert.equal(V.k4(g), 'pass');
  assert.equal(V.k4({ ...g, blocked: false }), 'inconclusive');
  assert.equal(V.k4({ ...g, compact: { ok: true, result: 'compacted' }, summary: true }), 'fail');
  assert.equal(V.k4({ ...g, compact: { ok: true, result: 'not_eligible', detail: 'not_quiet' } }), 'fail', 'must be refused for the lease');
  assert.equal(V.k4({ ...g, finish: { ok: false, message: 'x' } }), 'fail');
  assert.equal(V.k4({ ...g, finish: { ok: true, value: false } }), 'fail', 'the running sweep could not record');
  assert.equal(V.k4({ ...g, logAfter: [...L2] }), 'fail', 'a true reply but nothing stored');
  assert.equal(V.k4({ ...g, lastIsSweep: false }), 'fail');
  assert.equal(V.k4({ ...g, logAfter: [L2[1], SWEEP] }), 'fail', 'an earlier entry lost');
  assert.equal(V.k4({ ...g, summary: true }), 'fail');
});
