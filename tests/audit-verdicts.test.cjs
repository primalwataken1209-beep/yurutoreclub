// Unit tests for the verdict rules of tests-pg/audit-concurrency.cjs (pure functions; no database, no network).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../tests-pg/audit-verdicts.cjs');
const same = { otherBefore: 'h1', otherAfter: 'h1', rBefore: 'r1', rAfter: 'r1' };

test('A: hold first, purge skipped_changed; every record kept + the new hold; held; version +1; others and R unchanged', () => {
  const g = { control: true, blocked: true, hold: { ok: true }, purge: { ok: true, result: 'skipped_changed', removed: 0 },
    eventsBefore: 2, eventsAfter: 3, lastIsHold: true, heldAfter: true, versionBefore: 5, versionAfter: 6, ...same,
    oldCount: 2, oldFoundAfter: 2, oldHashBefore: 'o1', oldHashAfter: 'o1' };
  assert.equal(V.a(g), 'pass');
  assert.equal(V.a({ ...g, oldHashAfter: 'o2' }), 'fail', 'an existing record changed (same count)');
  assert.equal(V.a({ ...g, oldFoundAfter: 1 }), 'fail', 'an existing record was replaced');
  assert.equal(V.a({ ...g, oldHashBefore: undefined, oldHashAfter: undefined }), 'fail');
  assert.equal(V.a({ ...g, blocked: false }), 'inconclusive');
  assert.equal(V.a({ ...g, control: false }), 'inconclusive');
  assert.equal(V.a({ ...g, purge: { ok: true, result: 'deleted', removed: 2 }, eventsAfter: 1 }), 'fail', 'removed records during a new hold');
  assert.equal(V.a({ ...g, purge: { ok: true, result: 'not_eligible', removed: 0 } }), 'fail', 'must be the version check');
  assert.equal(V.a({ ...g, purge: { ok: false, message: 'deadlock' } }), 'fail');
  assert.equal(V.a({ ...g, eventsAfter: 2 }), 'fail', 'new hold record missing');
  assert.equal(V.a({ ...g, lastIsHold: false }), 'fail');
  assert.equal(V.a({ ...g, heldAfter: false }), 'fail');
  assert.equal(V.a({ ...g, versionAfter: 7 }), 'fail');
  assert.equal(V.a({ ...g, otherAfter: 'h2' }), 'fail', 'another job changed');
  assert.equal(V.a({ ...g, rAfter: 'r2' }), 'fail', 'R changed');
  assert.equal(V.a({ ...g, hold: { ok: false } }), 'fail');
});
test('B: purge first deleted the cycle; hold then succeeds; only the new hold record remains; held; version +1; others and R unchanged', () => {
  const g = { control: true, blocked: true, purge: { ok: true, result: 'deleted', removed: 2 }, hold: { ok: true },
    eventsBefore: 2, eventsAfter: 1, lastIsHold: true, heldAfter: true, versionBefore: 5, versionAfter: 6, ...same,
    oldIds: [11, 12], idsAfter: [13] };
  assert.equal(V.b(g), 'pass');
  assert.equal(V.b({ ...g, idsAfter: [12] }), 'fail', 'an old record survived (count 1 but old id)');
  assert.equal(V.b({ ...g, idsAfter: [12, 13], eventsAfter: 2 }), 'fail');
  assert.equal(V.b({ ...g, oldIds: [11] }), 'fail', 'old id list does not match the count before');
  assert.equal(V.b({ ...g, blocked: false }), 'inconclusive');
  assert.equal(V.b({ ...g, purge: { ok: true, result: 'deleted', removed: 1 } }), 'fail', 'partly removed');
  assert.equal(V.b({ ...g, purge: { ok: true, result: 'skipped_changed', removed: 0 } }), 'fail');
  assert.equal(V.b({ ...g, hold: { ok: false, message: 'x' } }), 'fail');
  assert.equal(V.b({ ...g, eventsAfter: 0, lastIsHold: false }), 'fail', 'the new hold record was lost');
  assert.equal(V.b({ ...g, eventsAfter: 3 }), 'fail', 'old records survived');
  assert.equal(V.b({ ...g, heldAfter: false }), 'fail');
  assert.equal(V.b({ ...g, versionAfter: 5 }), 'fail');
  assert.equal(V.b({ ...g, otherAfter: 'h2' }), 'fail');
  assert.equal(V.b({ ...g, rAfter: 'r2' }), 'fail');
});
