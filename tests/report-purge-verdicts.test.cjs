// Unit tests for the verdict rules of tests-pg/report-purge-concurrency.cjs (pure functions; no database, no network).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../tests-pg/report-purge-verdicts.cjs');

test('C1: control and wait required; only skipped_changed with the row kept and no error passes', () => {
  const g = { control: 'deleted', blocked: true, purge: { ok: true }, result: 'skipped_changed', rowExists: true };
  assert.equal(V.c1(g), 'pass');
  assert.equal(V.c1({ ...g, control: 'missing' }), 'inconclusive');
  assert.equal(V.c1({ ...g, blocked: false }), 'inconclusive');
  assert.equal(V.c1({ ...g, result: 'deleted', rowExists: false }), 'fail');
  assert.equal(V.c1({ ...g, purge: { ok: false, message: 'row changed under lock' }, result: null }), 'fail', 'no upfront lock shows as an error');
  assert.equal(V.c1({ ...g, rowExists: false }), 'fail');
});

test('C2: reopen must fail with "report not found" after the purge committed; row gone', () => {
  const g = { control: 'deleted', blocked: true, result: 'deleted', reopen: { ok: false, message: 'report not found' }, rowExists: false };
  assert.equal(V.c2(g), 'pass');
  assert.equal(V.c2({ ...g, blocked: false }), 'inconclusive');
  assert.equal(V.c2({ ...g, reopen: { ok: true } }), 'fail');
  assert.equal(V.c2({ ...g, reopen: { ok: false, message: 'deadlock detected' } }), 'fail', 'another error is not the expected one');
  assert.equal(V.c2({ ...g, result: 'skipped_held_or_open' }), 'fail');
  assert.equal(V.c2({ ...g, rowExists: true }), 'fail');
});

test('C3: second purge succeeds with missing; one deletion; two run records', () => {
  const g = { control: 'deleted', blocked: true, first: 'deleted', second: { ok: true }, secondResult: 'missing', rowExists: false, runs: 2 };
  assert.equal(V.c3(g), 'pass');
  assert.equal(V.c3({ ...g, control: undefined }), 'inconclusive');
  assert.equal(V.c3({ ...g, second: { ok: false, message: 'x' } }), 'fail');
  assert.equal(V.c3({ ...g, secondResult: 'deleted' }), 'fail');
  assert.equal(V.c3({ ...g, runs: 1 }), 'fail');
  assert.equal(V.c3({ ...g, rowExists: true }), 'fail');
});

test('C4: both waited; no deadlock; exactly two deleted and two missing; nothing left', () => {
  const X = 'x-id', Y = 'y-id';
  const g = { control: 'deleted', blocked: true, bothBlocked: true, q1ok: true, q2ok: true, q1: ['deleted', 'deleted'], q2: ['missing', 'missing'],
    ids: [X, Y], perId: { [X]: ['deleted', 'missing'], [Y]: ['deleted', 'missing'] }, deadlock: false, remaining: 0 };
  assert.equal(V.c4(g), 'pass');
  assert.equal(V.c4({ ...g, q1: ['missing', 'missing'], q2: ['deleted', 'deleted'], perId: { [X]: ['missing', 'deleted'], [Y]: ['missing', 'deleted'] } }), 'pass', 'either may go first');
  assert.equal(V.c4({ ...g, perId: { [X]: ['deleted', 'deleted'], [Y]: ['missing', 'missing'] } }), 'fail', 'one id deleted twice, the other never');
  assert.equal(V.c4({ ...g, perId: { [X]: ['deleted', 'missing'] } }), 'fail', 'an id without results');
  assert.equal(V.c4({ ...g, perId: { ...g.perId, other: ['deleted'] } }), 'fail', 'an unexpected id');
  assert.equal(V.c4({ ...g, ids: [X] }), 'fail');
  assert.equal(V.c4({ ...g, perId: { [X]: ['deleted', 'missing', 'missing'], [Y]: ['deleted'] } }), 'fail', 'totals right but one id answered three times');
  assert.equal(V.c4({ ...g, bothBlocked: false }), 'inconclusive');
  assert.equal(V.c4({ ...g, deadlock: true, q2ok: false, q2: [] }), 'fail');
  assert.equal(V.c4({ ...g, q2ok: false, q2: [] }), 'fail');
  assert.equal(V.c4({ ...g, q2ok: false }), 'fail', 'an error in either purge fails even if the counts look right');
  assert.equal(V.c4({ ...g, q1ok: false }), 'fail');
  assert.equal(V.c4({ ...g, q2: ['deleted', 'missing'] }), 'fail', 'three deletions reported');
  assert.equal(V.c4({ ...g, remaining: 1 }), 'fail');
});
