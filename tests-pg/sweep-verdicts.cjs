// Pure verdict rules for tests-pg/sweep-concurrency.cjs (no database). Unit-tested in tests/sweep-verdicts.test.cjs.
// 'pass' | 'fail' | 'inconclusive'. No control or no observed wait (barrier) → inconclusive, never a pass.
const pre = o => !!o && o.control === true && o.blocked === true;
const isBegun = r => !!r && typeof r === 'object' && typeof r.generation === 'number' && typeof r.user_id === 'string' && r.refused === undefined;

// S1 sweep/sweep: the second begin waits on the first's row lock, then is refused as busy; the first keeps the lease.
function s1(o) {
  if (!pre(o)) return 'inconclusive';
  return isBegun(o.first) && o.second && o.second.ok === true && o.second.value && o.second.value.refused === 'busy'
    && o.finalOwner === o.firstOwner ? 'pass' : 'fail';
}
// S2 normal claim → sweep: the sweep's begin waits on the claim's row lock, then is refused as busy; the claim keeps the lease.
function s2(o) {
  if (!pre(o)) return 'inconclusive';
  return o.claim && typeof o.claim.generation === 'number' && o.sweep && o.sweep.ok === true && o.sweep.value && o.sweep.value.refused === 'busy'
    && o.finalOwner === o.claimOwner ? 'pass' : 'fail';
}
// S3 sweep → normal claim: the claim waits on the sweep's row lock, then gets nothing (null, no error); the sweep keeps the lease.
function s3(o) {
  if (!pre(o)) return 'inconclusive';
  return isBegun(o.sweep) && o.claim && o.claim.ok === true && o.claim.value === null && o.finalOwner === o.sweepOwner ? 'pass' : 'fail';
}
module.exports = { s1, s2, s3 };
