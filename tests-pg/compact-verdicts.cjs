// Pure verdict rules for tests-pg/compact-concurrency.cjs (no database). Unit-tested in tests/compact-verdicts.test.cjs.
// 'pass' | 'fail' | 'inconclusive'. No control or no observed wait → inconclusive, never a pass.
const pre = o => !!o && o.control === true && o.blocked === true;
const ok = r => !!r && r.ok === true;

// K1 compaction first, then sweep_begin: the begin waits on the row, then takes the lease (a compacted job stays sweepable);
//   the log is the summary only; the version moved by exactly the compaction and the begin (2).
function k1(o) {
  if (!pre(o)) return 'inconclusive';
  return o.compact === 'compacted' && ok(o.begin) && o.begin.value && typeof o.begin.value.generation === 'number' && o.begin.value.refused === undefined
    && o.logLen === 1 && o.summary === true && o.versionDelta === 2 ? 'pass' : 'fail';
}
// K2 sweep_begin first, then compaction: compaction waits, then sees a changed version → skipped_changed; the log is untouched.
function k2(o) {
  if (!pre(o)) return 'inconclusive';
  return ok(o.begin) && o.begin.value && typeof o.begin.value.generation === 'number' && ok(o.compact) && o.compact.result === 'skipped_changed'
    && o.logLen === o.logLenBefore && o.summary === false ? 'pass' : 'fail';
}
// K3 sweep_finish first (appends a log entry), then compaction: compaction waits, then skipped_changed; the new entry is kept.
function k3(o) {
  if (!pre(o)) return 'inconclusive';
  return ok(o.finish) && o.finish.value === true && ok(o.compact) && o.compact.result === 'skipped_changed'
    && o.logLen === o.logLenBefore + 1 && o.lastIsSweep === true ? 'pass' : 'fail';
}
// K4 compaction first, then sweep_finish of a sweep that began before (lease held → compaction must refuse, never compact):
//   compaction is not_eligible 'lease'; the finish then records normally.
function k4(o) {
  if (!pre(o)) return 'inconclusive';
  return ok(o.compact) && o.compact.result === 'not_eligible' && o.compact.detail === 'lease' && ok(o.finish) && o.finish.value === true
    && o.summary === false ? 'pass' : 'fail';
}
module.exports = { k1, k2, k3, k4 };
