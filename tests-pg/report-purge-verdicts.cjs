// Pure verdict rules for tests-pg/report-purge-concurrency.cjs (no database). Unit-tested in tests/report-purge-verdicts.test.cjs.
// 'pass' | 'fail' | 'inconclusive'. A case whose control or wait (barrier) did not happen is inconclusive, never a pass.
const pre = o => o && o.control === 'deleted' && o.blocked === true;

// C1: a concurrent uncommitted change; purge waits on the row, then sees the new version and skips it (no error, row kept).
function c1(o) {
  if (!pre(o)) return 'inconclusive';
  return o.purge && o.purge.ok === true && o.result === 'skipped_changed' && o.rowExists === true ? 'pass' : 'fail';
}
// C2: purge holds the lock and deletes; a concurrent reopen waits, then finds nothing ("report not found"); the row is gone.
function c2(o) {
  if (!pre(o)) return 'inconclusive';
  return o.result === 'deleted' && o.reopen && o.reopen.ok === false && /report not found/.test(o.reopen.message || '')
    && o.rowExists === false ? 'pass' : 'fail';
}
// C3: the same id purged twice at once: the second waits, then reports missing without error; one deletion, two run records.
function c3(o) {
  if (!pre(o)) return 'inconclusive';
  return o.first === 'deleted' && o.second && o.second.ok === true && o.secondResult === 'missing'
    && o.rowExists === false && o.runs === 2 ? 'pass' : 'fail';
}
// C4: overlapping ids given in opposite orders, both waiting on a held row: no deadlock; together they delete each row once.
// Per id: exactly one 'deleted' and one 'missing' (from the two purges); no other ids in the results.
function c4(o) {
  if (!pre(o) || o.bothBlocked !== true) return 'inconclusive';
  const all = [...(o.q1 || []), ...(o.q2 || [])];
  const deleted = all.filter(r => r === 'deleted').length, missing = all.filter(r => r === 'missing').length;
  const ids = o.ids || [], per = o.perId || {};
  const perIdOk = ids.length === 2 && Object.keys(per).length === 2
    && ids.every(id => Array.isArray(per[id]) && [...per[id]].sort().join(',') === 'deleted,missing');
  return o.q1ok === true && o.q2ok === true && o.deadlock === false && deleted === 2 && missing === 2 && perIdOk && o.remaining === 0 ? 'pass' : 'fail';
}
module.exports = { c1, c2, c3, c4 };
