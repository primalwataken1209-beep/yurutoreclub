const { test } = require('node:test');
const assert = require('node:assert/strict');
const { functions } = require('./helpers.cjs');
const uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const image = uid + '/11111111-1111-1111-1111-111111111111.jpg';
function setup({ removeError = null, updateError = null } = {}) {
  const calls = [];
  const chain = { update(patch) { calls.push(['update', { ...patch }]); return this; }, eq(k,v) { calls.push([k,v]); return this; }, then(resolve) { resolve({error:updateError}); } };
  const ctx = functions(['snsSoftDeletePost', 'snsRemovePostImage', 'snsIsOwnImagePath'], {
    SNS_IMG_PATH_RE: /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/, SNS_IMG_BUCKET: 'post-images', SNS_IMG_URLS: {},
    snsGuard: id => id === uid ? null : 'login required', snsOk: data => ({data,error:null}), snsNg: () => ({data:null,error:'failed'}),
    supabaseClient: { storage: { from(bucket) { assert.equal(bucket,'post-images'); return { async remove(paths) { calls.push(['remove',Array.from(paths)]); return {error:removeError}; } }; } }, from(table) { assert.equal(table,'posts'); return chain; } }
  });
  return { ctx, calls };
}
test('photo removal precedes owner-filtered post update', async () => {
  const {ctx,calls} = setup();
  assert.equal((await ctx.snsSoftDeletePost(uid,'post',image)).error,null);
  assert.deepEqual(calls,[['remove',[image]],['update',{is_deleted:true,image_path:null}],['id','post'],['user_id',uid]]);
});
test('Storage error preserves the post and permits retry', async () => {
  const {ctx,calls} = setup({removeError:{message:'offline'}});
  assert.ok((await ctx.snsSoftDeletePost(uid,'post',image)).error);
  assert.deepEqual(calls,[['remove',[image]]]);
});
test('DB update error is reported after successful photo removal', async () => {
  const {ctx} = setup({updateError:{message:'denied'}});
  assert.ok((await ctx.snsSoftDeletePost(uid,'post',image)).error);
});
test('foreign photo is never removed; guest cannot delete', async () => {
  const {ctx,calls} = setup();
  await ctx.snsSoftDeletePost(uid,'post',image.replace(uid,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'));
  assert.equal(calls.some(c=>c[0]==='remove'),false);
  calls.length=0;
  assert.ok((await ctx.snsSoftDeletePost('guest','post',image)).error);
  assert.equal(calls.length,0);
});
