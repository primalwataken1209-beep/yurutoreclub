// Unit tests for the verdict rules of tests-pg/sweep-concurrency.cjs (pure functions; no database, no network).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../tests-pg/sweep-verdicts.cjs');
const U = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const begun = { user_id: U, generation: 2 };
const busy = { ok: true, value: { refused: 'busy' } };

test('S1: control and observed wait required; second begin refused busy; first keeps the lease', () => {
  const g = { control: true, blocked: true, first: begun, firstOwner: 'sweep-A', second: busy, finalOwner: 'sweep-A' };
  assert.equal(V.s1(g), 'pass');
  assert.equal(V.s1({ ...g, control: false }), 'inconclusive');
  assert.equal(V.s1({ ...g, blocked: false }), 'inconclusive');
  assert.equal(V.s1({ ...g, second: { ok: true, value: { user_id: U, generation: 3 } } }), 'fail', 'both sweeps began');
  assert.equal(V.s1({ ...g, second: { ok: false, code: '40P01', message: 'deadlock' } }), 'fail');
  assert.equal(V.s1({ ...g, second: { ok: true, value: { refused: 'not_past_auth' } } }), 'fail', 'refused for another reason');
  assert.equal(V.s1({ ...g, first: { refused: 'busy' } }), 'fail');
  assert.equal(V.s1({ ...g, first: { ...begun, refused: 'busy' } }), 'fail', 'a reply carrying a refusal is not a begin');
  assert.equal(V.s1({ ...g, finalOwner: 'sweep-B' }), 'fail');
});

test('S2: claim then sweep: the sweep is refused busy and the claim keeps the lease', () => {
  const g = { control: true, blocked: true, claim: { generation: 2, state: 'NEEDS_OPERATOR', user_id: U }, claimOwner: 'worker-A', sweep: busy, finalOwner: 'worker-A' };
  assert.equal(V.s2(g), 'pass');
  assert.equal(V.s2({ ...g, blocked: false }), 'inconclusive');
  assert.equal(V.s2({ ...g, claim: null }), 'fail', 'claim did not take the lease');
  assert.equal(V.s2({ ...g, sweep: { ok: true, value: begun } }), 'fail', 'sweep began during the claim');
  assert.equal(V.s2({ ...g, sweep: { ok: false, message: 'x' } }), 'fail');
  assert.equal(V.s2({ ...g, finalOwner: 'sweep-B' }), 'fail');
});

test('S3: sweep then claim: the claim gets null without error and the sweep keeps the lease', () => {
  const g = { control: true, blocked: true, sweep: begun, sweepOwner: 'sweep-A', claim: { ok: true, value: null }, finalOwner: 'sweep-A' };
  assert.equal(V.s3(g), 'pass');
  assert.equal(V.s3({ ...g, control: undefined }), 'inconclusive');
  assert.equal(V.s3({ ...g, claim: { ok: true, value: { generation: 3 } } }), 'fail', 'claim took the lease');
  assert.equal(V.s3({ ...g, claim: { ok: false, message: 'deadlock' } }), 'fail');
  assert.equal(V.s3({ ...g, claim: { ok: true, value: undefined } }), 'fail', 'no row is not the same as null');
  assert.equal(V.s3({ ...g, sweep: { refused: 'busy' } }), 'fail');
  assert.equal(V.s3({ ...g, finalOwner: 'worker-B' }), 'fail');
});
