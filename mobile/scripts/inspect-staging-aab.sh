#!/usr/bin/env bash
# Inspects an unsigned staging release AAB before it may be kept as a short-lived artifact.
# Usage: inspect-staging-aab.sh <app-release.aab> <bundletool.jar> <out-dir>
# Expects YT_STAGING_PUBLISHABLE_KEY in the environment (never printed). Fails on the first problem.
set -euo pipefail
aab="$1"; bundletool="$2"; out="$3"
staging=knftduojdalnawvkbelt; production=eszheiabjwehcbrteqza; app_id=club.yurutore.app
fail(){ echo "AAB inspection failed: $1" >&2; exit 1; }
test -f "$aab" || fail 'missing AAB'
mkdir -p "$out"

# 1. Not signed: no signature files and jarsigner reports it unsigned.
if unzip -l "$aab" | grep -Eq 'META-INF/.*\.(RSA|DSA|EC)$'; then fail 'AAB is signed'; fi
jarsigner -verify "$aab" > "$out/jarsigner.txt" 2>&1 || true
grep -q 'jar is unsigned' "$out/jarsigner.txt" || fail 'jarsigner did not report unsigned'

# 2. Manifest: approved ID, not debuggable, no cleartext, no backup, INTERNET only.
java -jar "$bundletool" dump manifest --bundle "$aab" > "$out/manifest.xml"
grep -q "package=\"$app_id\"" "$out/manifest.xml" || fail 'package is not the approved ID'
if grep -q 'android:debuggable="true"' "$out/manifest.xml"; then fail 'debuggable'; fi
if grep -q 'android:usesCleartextTraffic="true"' "$out/manifest.xml"; then fail 'cleartext traffic'; fi
grep -q 'android:allowBackup="false"' "$out/manifest.xml" || fail 'backup not disabled'
perms=$(grep -o 'uses-permission android:name="[^"]*"' "$out/manifest.xml" | grep -v '\.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"' | sort -u)
test "$perms" = 'uses-permission android:name="android.permission.INTERNET"' || fail 'unexpected permissions'

# 3. Bundled web assets: staging target, approved callback, the given publishable key, no production reference.
rm -rf "$out/assets"; mkdir "$out/assets"
unzip -q "$aab" 'base/assets/public/*' -d "$out/assets"
pub="$out/assets/base/assets/public"
node -e '
const fs=require("fs"),p=process.argv[1];
const info=JSON.parse(fs.readFileSync(p+"/build-info.json","utf8"));
const cfg=fs.readFileSync(p+"/native-config.js","utf8");
const ok=info.target==="staging"&&info.appId==="club.yurutore.app"&&info.supabaseUrl==="https://knftduojdalnawvkbelt.supabase.co"
  &&cfg.includes("\"redirectUrl\":\"club.yurutore.app://auth/callback\"")&&cfg.includes("\"supabaseUrl\":\"https://knftduojdalnawvkbelt.supabase.co\"");
if(!ok){console.error("AAB inspection failed: build target, ID or callback");process.exit(1);}
' "$pub"
if grep -rq "$production" "$out/assets"; then fail 'production reference in bundled assets'; fi
grep -q "$staging" "$pub/app.bundle.js" || fail 'staging reference missing'
grep -qF "$YT_STAGING_PUBLISHABLE_KEY" "$pub/app.bundle.js" || fail 'bundle does not carry the given staging key'
if grep -rqE 'sb_secret_|service_role' "$out/assets"; then fail 'secret-like value in bundled assets'; fi
if grep -q 'CI_COMPILE_ONLY' "$pub/app.bundle.js"; then fail 'compile-only placeholder key in bundle'; fi

# 4. Record what passed.
cp "$pub/build-info.json" "$out/build-info.json"
( cd "$(dirname "$aab")" && sha256sum "$(basename "$aab")" ) > "$out/app-release.aab.sha256"
rm -rf "$out/assets" "$out/manifest.xml"
echo "AAB inspection passed: unsigned, $app_id, staging only."
