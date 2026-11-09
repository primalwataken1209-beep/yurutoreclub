// Checks that YT_STAGING_PUBLISHABLE_KEY is a Supabase publishable key and nothing more powerful.
// Never prints the key. Exit code 0 = acceptable, 1 = refused (with a reason code only).
function checkStagingKey(key){
  if(typeof key!=='string'||key.length===0)return 'missing';
  if(/\s/.test(key))return 'whitespace';
  if(/sb_secret_|service_role/i.test(key))return 'secret_key';
  if(/^eyJ/.test(key)||key.split('.').length===3)return 'jwt_key';     // legacy anon/service_role JWT keys are not accepted
  if(!/^sb_publishable_[A-Za-z0-9_-]{10,200}$/.test(key))return 'not_publishable';
  return null;
}
module.exports={checkStagingKey};
if(require.main===module){
  const reason=checkStagingKey(process.env.YT_STAGING_PUBLISHABLE_KEY);
  if(reason){console.error('Staging key refused: '+reason);process.exit(1);}
  console.log('Staging key accepted (publishable key format).');
}
