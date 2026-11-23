// Pure verdict rules for tests-pg/audit-concurrency.cjs (no database). Unit-tested in tests/audit-verdicts.test.cjs.
// 'pass' | 'fail' | 'inconclusive'. No control or no observed wait → inconclusive, never a pass.
// Success replies alone are not enough: stored counts, versions, the hold flag and the untouched rows are compared.
const pre = o => !!o && o.control === true && o.blocked === true;
const untouched = o => typeof o.otherBefore === 'string' && o.otherBefore === o.otherAfter && typeof o.rBefore === 'string' && o.rBefore === o.rAfter;

// A hold first, then purge: purge waits on the job row, then sees a new version → skipped_changed; every record kept (old + the new hold);
//   the job stays on hold; the version moved by exactly the hold (1); other L rows and R unchanged.
function a(o) {
  if (!pre(o)) return 'inconclusive';
  return o.hold && o.hold.ok === true && o.purge && o.purge.ok === true && o.purge.result === 'skipped_changed' && o.purge.removed === 0
    && o.eventsAfter === o.eventsBefore + 1 && o.lastIsHold === true && o.heldAfter === true && o.versionAfter === o.versionBefore + 1
    && untouched(o) ? 'pass' : 'fail';
}
// B purge first, then hold: the hold waits, then succeeds: the old records are gone (exactly the cycle), the new hold record remains alone,
//   the job is on hold; the version moved by exactly the hold (1; the purge does not change L); other L rows and R unchanged.
function b(o) {
  if (!pre(o)) return 'inconclusive';
  return o.purge && o.purge.ok === true && o.purge.result === 'deleted' && o.purge.removed === o.eventsBefore && o.hold && o.hold.ok === true
    && o.eventsAfter === 1 && o.lastIsHold === true && o.heldAfter === true && o.versionAfter === o.versionBefore + 1
    && untouched(o) ? 'pass' : 'fail';
}
module.exports = { a, b };
