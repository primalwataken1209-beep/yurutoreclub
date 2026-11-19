// Pure verdict rules for tests-pg/drain-concurrency.cjs (no database). Unit-tested in tests/drain-concurrency-verdicts.test.cjs.
// Each returns 'pass' | 'fail' | 'inconclusive' | 'observation'. A case whose intended precondition did not happen (e.g. the writer
// that should succeed failed for another reason) is inconclusive, never a pass.
const RLS = '42501';

// Late writer parked after its snapshot while R committed. The intended write must succeed and its row must exist; otherwise the
// scenario did not happen as designed.
function lateWriter(o, observeOnly) {
  if (!o.writer || o.writer.ok !== true || o.rowExists !== true) return 'inconclusive';
  if (observeOnly) return 'observation';
  return o.drainedWhileOpen === false && o.drainedAfter === true ? 'pass' : 'fail';
}
// Two marks at once. capturedAtBefore: m1's drain_captured_at as exact text before m1 committed; capturedAtAfter: after m2 committed.
// drained must be false while m2 is blocked, false after m2's mark returned but before it committed, true only after both ended.
function concurrentMarks(o) {
  if (typeof o.capturedAtBefore !== 'string' || o.capturedAtBefore === '') return 'inconclusive';
  if (!o.second || o.second.ok !== true) return 'fail';
  return o.capturedAtAfter === o.capturedAtBefore && o.m1CapturedM2 === true
    && o.drainedWhileBlocked === false && o.drainedWhileM2Open === false && o.drainedAfterBoth === true ? 'pass' : 'fail';
}
// Control must succeed first; the refusal must be the guard's 42501.
function signedStyle(o) {
  if (!o.control || o.control.ok !== true) return 'inconclusive';
  return o.writer && o.writer.ok === false && o.writer.code === RLS && /writes refused for a user being deleted/.test(o.writer.message || '') ? 'pass' : 'fail';
}
function afterCapture(o) {
  if (!o.control || o.control.ok !== true) return 'inconclusive';
  return o.drained === true && o.writer && o.writer.ok === false && o.writer.code === RLS && /row-level security/.test(o.writer.message || '') ? 'pass' : 'fail';
}
function perSessionDisabled(o) {
  if (o.callerOn !== true) return 'inconclusive';
  return o.mark && o.mark.ok === false && /not fully visible/.test(o.mark.message || '') && o.nothingCaptured === true ? 'pass' : 'fail';
}
module.exports = { RLS, lateWriter, concurrentMarks, signedStyle, afterCapture, perSessionDisabled };
