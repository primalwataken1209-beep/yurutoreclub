// Unit tests for the verdict rules of tests-pg/drain-concurrency.cjs (pure functions; no database, no network).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../tests-pg/verdicts.cjs');
const ok = { ok: true };
const rls = { ok: false, code: '42501', message: 'new row violates row-level security policy for table "objects"' };
const guard = { ok: false, code: '42501', message: 'yt deletion guard: writes refused for a user being deleted' };
const other = { ok: false, code: '23505', message: 'duplicate key value violates unique constraint' };

test('late writer: the intended write and its row are required; otherwise inconclusive, never pass', () => {
  const good = { writer: ok, rowExists: true, drainedWhileOpen: false, drainedAfter: true };
  assert.equal(V.lateWriter(good, false), 'pass');
  assert.equal(V.lateWriter({ ...good, writer: other }, false), 'inconclusive', 'unrelated writer error');
  assert.equal(V.lateWriter({ ...good, writer: undefined }, false), 'inconclusive');
  assert.equal(V.lateWriter({ ...good, rowExists: false }, false), 'inconclusive', 'row missing');
  assert.equal(V.lateWriter({ ...good, drainedWhileOpen: true }, false), 'fail');
  assert.equal(V.lateWriter({ ...good, drainedWhileOpen: null }, false), 'fail');
  assert.equal(V.lateWriter({ ...good, drainedAfter: false }, false), 'fail');
  assert.equal(V.lateWriter({ ...good, drainedWhileOpen: true }, true), 'observation');
  assert.equal(V.lateWriter({ ...good, writer: other }, true), 'inconclusive', 'observation also needs the intended write');
});

test('concurrent marks: exact capture-time equality, second mark succeeds, drained false while blocked and while m2 is open, true after both', () => {
  const t = '2026-11-19 01:02:03.456789+00';
  const good = { second: ok, capturedAtBefore: t, capturedAtAfter: t, m1CapturedM2: true, drainedWhileBlocked: false, drainedWhileM2Open: false, drainedAfterBoth: true };
  assert.equal(V.concurrentMarks(good), 'pass');
  assert.equal(V.concurrentMarks({ ...good, capturedAtAfter: '2026-11-19 01:02:03.456790+00' }), 'fail', 'one microsecond later');
  assert.equal(V.concurrentMarks({ ...good, capturedAtAfter: null }), 'fail');
  assert.equal(V.concurrentMarks({ ...good, capturedAtBefore: null }), 'inconclusive', 'm1 did not capture');
  assert.equal(V.concurrentMarks({ ...good, second: other }), 'fail');
  assert.equal(V.concurrentMarks({ ...good, m1CapturedM2: false }), 'fail');
  assert.equal(V.concurrentMarks({ ...good, drainedWhileBlocked: true }), 'fail');
  assert.equal(V.concurrentMarks({ ...good, drainedWhileM2Open: true }), 'fail');
  assert.equal(V.concurrentMarks({ ...good, drainedWhileM2Open: null }), 'fail');
  assert.equal(V.concurrentMarks({ ...good, drainedAfterBoth: false }), 'fail');
});

test('signed-style and after-capture: control first (else inconclusive); only the expected 42501 refusal passes', () => {
  assert.equal(V.signedStyle({ control: ok, writer: guard }), 'pass');
  assert.equal(V.signedStyle({ control: other, writer: guard }), 'inconclusive');
  assert.equal(V.signedStyle({ control: ok, writer: rls }), 'fail', 'RLS text is not the guard');
  assert.equal(V.signedStyle({ control: ok, writer: { ...guard, code: '23505' } }), 'fail');
  assert.equal(V.signedStyle({ control: ok, writer: ok }), 'fail');
  assert.equal(V.afterCapture({ control: ok, drained: true, writer: rls }), 'pass');
  assert.equal(V.afterCapture({ control: other }), 'inconclusive');
  assert.equal(V.afterCapture({ control: ok, drained: false, writer: rls }), 'fail');
  assert.equal(V.afterCapture({ control: ok, drained: true, writer: other }), 'fail');
  assert.equal(V.afterCapture({ control: ok, drained: true, writer: { ...rls, code: '42P01' } }), 'fail');
});

test('per-session disabled: caller must be on; mark must fail as not fully visible and capture nothing', () => {
  const bad = { ok: false, message: 'drain capture: a client backend is not fully visible (fail closed)' };
  assert.equal(V.perSessionDisabled({ callerOn: true, mark: bad, nothingCaptured: true }), 'pass');
  assert.equal(V.perSessionDisabled({ callerOn: false, mark: bad, nothingCaptured: true }), 'inconclusive');
  assert.equal(V.perSessionDisabled({ callerOn: true, mark: ok, nothingCaptured: true }), 'fail');
  assert.equal(V.perSessionDisabled({ callerOn: true, mark: { ok: false, message: 'other' }, nothingCaptured: true }), 'fail');
  assert.equal(V.perSessionDisabled({ callerOn: true, mark: bad, nothingCaptured: false }), 'fail');
});
