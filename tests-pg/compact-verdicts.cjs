// Pure verdict rules for tests-pg/compact-concurrency.cjs (no database). Unit-tested in tests/compact-verdicts.test.cjs.
// 'pass' | 'fail' | 'inconclusive'. No control or no observed wait → inconclusive, never a pass.
// A success reply alone does not prove what was stored: the stored log is compared with what was there before.
const pre = o => !!o && o.control === true && o.blocked === true;
const ok = r => !!r && r.ok === true;
const begun = r => ok(r) && !!r.value && typeof r.value.generation === 'number' && r.value.refused === undefined;
// The earlier log entries are still there unchanged, in order (JSON text of each entry).
const keptBefore = o => Array.isArray(o.logBefore) && Array.isArray(o.logAfter) && o.logAfter.length >= o.logBefore.length
  && o.logBefore.every((e, i) => e === o.logAfter[i]);

// K1 compaction first, then sweep_begin: the begin waits, then takes the lease (a compacted job stays sweepable);
//   the log is the summary only; the version moved by exactly the compaction and the begin (2).
function k1(o) {
  if (!pre(o)) return 'inconclusive';
  return o.compact === 'compacted' && begun(o.begin) && o.logLen === 1 && o.summary === true && o.versionDelta === 2 ? 'pass' : 'fail';
}
// K2 sweep_begin first, then compaction: the begin really began (no refusal); compaction waits, then skipped_changed;
//   the log is exactly what it was (begin writes no log entry).
function k2(o) {
  if (!pre(o)) return 'inconclusive';
  return begun(o.begin) && ok(o.compact) && o.compact.result === 'skipped_changed'
    && keptBefore(o) && o.logAfter.length === o.logBefore.length && o.summary === false ? 'pass' : 'fail';
}
// K3 sweep_finish first (appends one entry), then compaction: compaction waits, then skipped_changed; earlier entries kept
//   unchanged and exactly one new sweep entry at the end.
function k3(o) {
  if (!pre(o)) return 'inconclusive';
  return ok(o.finish) && o.finish.value === true && ok(o.compact) && o.compact.result === 'skipped_changed'
    && keptBefore(o) && o.logAfter.length === o.logBefore.length + 1 && o.lastIsSweep === true ? 'pass' : 'fail';
}
// K4 compaction during a running sweep (lease held → compaction refuses), then sweep_finish: compaction not_eligible 'lease';
//   the finish records: earlier entries kept, exactly one new sweep entry at the end, nothing compacted.
function k4(o) {
  if (!pre(o)) return 'inconclusive';
  return ok(o.compact) && o.compact.result === 'not_eligible' && o.compact.detail === 'lease' && ok(o.finish) && o.finish.value === true
    && keptBefore(o) && o.logAfter.length === o.logBefore.length + 1 && o.lastIsSweep === true && o.summary === false ? 'pass' : 'fail';
}
module.exports = { k1, k2, k3, k4 };
