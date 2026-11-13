"""Manual staging signing validation. No upload; private outputs are removed."""
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import zipfile

APP = 'club.yurutore.app'
STAGING = 'https://knftduojdalnawvkbelt.supabase.co'
PRODUCTION_REF = 'eszheiabjwehcbrteqza'
SECRET_NAMES = ('IOS_DISTRIBUTION_P12_BASE64', 'IOS_DISTRIBUTION_P12_PASSWORD',
                'IOS_APPSTORE_PROFILE_BASE64')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_profile(p, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    teams = p.get('TeamIdentifier', [])
    require(len(teams) == 1 and re.fullmatch(r'[A-Z0-9]{10}', teams[0]), 'Invalid team')
    team = teams[0]
    e = p.get('Entitlements', {})
    require(e.get('application-identifier') == team + '.' + APP, 'Wrong app identifier')
    require(e.get('com.apple.developer.team-identifier') == team, 'Wrong team entitlement')
    require('iOS' in p.get('Platform', []), 'Not an iOS profile')
    require(re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', p.get('UUID', '')) is not None, 'Invalid UUID')
    expiry = p.get('ExpirationDate')
    require(isinstance(expiry, dt.datetime), 'Invalid expiry')
    require(expiry.replace(tzinfo=dt.timezone.utc) > now, 'Expired profile')
    require(e.get('get-task-allow') is False, 'Debug profile refused')
    require(e.get('beta-reports-active') is True, 'Not an App Store profile')
    require('ProvisionedDevices' not in p and 'ProvisionsAllDevices' not in p,
            'Ad hoc/development/enterprise profile refused')
    certs = p.get('DeveloperCertificates', [])
    require(certs and all(isinstance(c, bytes) and c for c in certs), 'Missing certificates')
    return team


def check_assets(public, key):
    info = json.loads((public / 'build-info.json').read_text())
    require(info.get('target') == 'staging' and info.get('appId') == APP
            and info.get('supabaseUrl') == STAGING, 'Wrong build target')
    bundle = (public / 'app.bundle.js').read_text()
    require(key in bundle and 'CI_COMPILE_ONLY' not in bundle, 'Wrong staging key')
    config = (public / 'native-config.js').read_text()
    require('"redirectUrl":"' + APP + '://auth/callback"' in config,
            'Wrong callback')
    for f in public.rglob('*'):
        if f.is_file() and f.suffix.lower() in ('.js', '.html', '.json', '.css'):
            text = f.read_text()
            require(PRODUCTION_REF not in text, 'Production reference in assets')
            require(not re.search(r'sb_secret_[A-Za-z0-9_-]{8,}', text), 'Secret key in assets')


def patch_project(text, team, uuid, build):
    require(re.fullmatch(r'[1-9][0-9]{0,8}', build) is not None, 'Invalid build number')
    # Change only App target Release settings in the disposable checkout, not SPM targets.
    pattern = r'(504EC3181FED79650016851F /\* Release \*/ = \{.*?buildSettings = \{)(.*?)(\n\t\t\t\};)'
    matches = list(re.finditer(pattern, text, re.S))
    require(len(matches) == 1, 'App Release target changed; review required')
    m = matches[0]
    settings = m[2]
    require('CODE_SIGN_STYLE = Automatic;' in settings, 'Unexpected signing settings')
    require('CURRENT_PROJECT_VERSION = 1;' in settings, 'Unexpected base build number')
    settings = settings.replace('CODE_SIGN_STYLE = Automatic;',
        'CODE_SIGN_STYLE = Manual;\n'
        f'\t\t\t\tDEVELOPMENT_TEAM = {team};\n'
        '\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";\n'
        f'\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "{uuid}";')
    settings = settings.replace('CURRENT_PROJECT_VERSION = 1;', f'CURRENT_PROJECT_VERSION = {build};')
    return text[:m.start(2)] + settings + text[m.end(2):]


def run(args, env, **kwargs):
    # Never print child output or argv: keychain commands carry sensitive arguments.
    result = subprocess.run([str(a) for a in args], env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, **kwargs)
    if result.returncode:
        raise RuntimeError('Tool failed: ' + Path(str(args[0])).name + '; private output suppressed')
    return result.stdout


def main():
    require(sys.platform == 'darwin' and os.environ.get('GITHUB_ACTIONS') == 'true',
            'GitHub-hosted macOS runner required')
    require(os.environ.get('GITHUB_REF') == 'refs/heads/claude/store-release-prep', 'Wrong branch')
    build = os.environ['IOS_BUILD_NUMBER']
    require(re.fullmatch(r'[1-9][0-9]{0,8}', build) is not None, 'Invalid build number')
    key = os.environ['YT_STAGING_PUBLISHABLE_KEY']
    require(re.fullmatch(r'sb_publishable_[A-Za-z0-9_-]{10,200}', key) is not None
            and 'CI_COMPILE_ONLY' not in key, 'Real publishable key required')
    secret_values = {name: os.environ.pop(name) for name in SECRET_NAMES}
    require(all(secret_values.values()), 'Signing secrets missing')
    child_env = dict(os.environ)
    child_env.pop('YT_STAGING_PUBLISHABLE_KEY', None)
    mobile = Path.cwd()
    check_assets(mobile / 'ios/App/App/public', key)
    root = Path(tempfile.mkdtemp(prefix='yt-sign-', dir=os.environ['RUNNER_TEMP']))
    os.chmod(root, 0o700)
    keychain = root / 'signing.keychain-db'
    installed = None
    old_chains = None
    try:
        print('Validating provisioning profile.', flush=True)
        p12 = root / 'distribution.p12'
        profile = root / 'profile.mobileprovision'
        p12.write_bytes(base64.b64decode(secret_values[SECRET_NAMES[0]].strip(), validate=True))
        profile.write_bytes(base64.b64decode(secret_values[SECRET_NAMES[2]].strip(), validate=True))
        p = plistlib.loads(run(['security', 'cms', '-D', '-i', profile], child_env))
        team = validate_profile(p)
        uuid = p['UUID']
        password = secret_values[SECRET_NAMES[1]].strip()
        secret_values.clear()
        kc_password = secrets.token_urlsafe(32)
        run(['security', 'create-keychain', '-p', kc_password, keychain], child_env)
        run(['security', 'set-keychain-settings', '-lut', '3600', keychain], child_env)
        run(['security', 'unlock-keychain', '-p', kc_password, keychain], child_env)
        run(['security', 'import', p12, '-P', password, '-k', keychain,
             '-T', '/usr/bin/codesign', '-T', '/usr/bin/security'], child_env)
        password = None
        p12.unlink()
        run(['security', 'set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:',
             '-s', '-k', kc_password, keychain], child_env)
        identities = run(['security', 'find-identity', '-v', '-p', 'codesigning', keychain], child_env).decode()
        valid = [hashlib.sha1(c).hexdigest().upper() for c in p['DeveloperCertificates']]
        require(any(fp in identities for fp in valid), 'Profile certificate/private key not valid')
        profile_dir = Path.home() / 'Library/MobileDevice/Provisioning Profiles'
        profile_dir.mkdir(parents=True, exist_ok=True)
        destination = profile_dir / (uuid + '.mobileprovision')
        require(not destination.exists(), 'Profile already installed; refusing overwrite')
        installed = destination
        shutil.copyfile(profile, installed)
        project = mobile / 'ios/App/App.xcodeproj/project.pbxproj'
        project.write_text(patch_project(project.read_text(), team, uuid, build))
        options = dict(method='app-store-connect', destination='export', teamID=team,
                       signingStyle='manual', signingCertificate='Apple Distribution',
                       manageAppVersionAndBuildNumber=False,
                       provisioningProfiles={APP: uuid})
        export_options = root / 'ExportOptions.plist'
        export_options.write_bytes(plistlib.dumps(options))
        # Include only this job's keychain plus Apple's existing login/system chains for export.
        old_chains = re.findall(r'"([^"]+)"', run(['security', 'list-keychains', '-d', 'user'], child_env).decode())
        run(['security', 'list-keychains', '-d', 'user', '-s', keychain, *old_chains], child_env)
        archive = root / 'App.xcarchive'
        print('Archiving signed staging app; logs remain private.', flush=True)
        run(['xcodebuild', '-project', mobile / 'ios/App/App.xcodeproj', '-scheme', 'App',
             '-configuration', 'Release', '-destination', 'generic/platform=iOS',
             '-derivedDataPath', root / 'dd', '-archivePath', archive,
             'OTHER_CODE_SIGN_FLAGS=--keychain ' + str(keychain), 'archive'], child_env)
        print('Exporting App Store-format IPA without uploading.', flush=True)
        run(['xcodebuild', '-exportArchive', '-archivePath', archive,
             '-exportPath', root / 'export', '-exportOptionsPlist', export_options], child_env)
        ipas = list((root / 'export').glob('*.ipa'))
        require(len(ipas) == 1, 'Expected exactly one IPA')
        unpack = root / 'unpacked'
        with zipfile.ZipFile(ipas[0]) as z:
            for name in z.namelist():
                require(not name.startswith('/') and '..' not in Path(name).parts, 'Unsafe IPA path')
            z.extractall(unpack)
        apps = list((unpack / 'Payload').glob('*.app'))
        require(len(apps) == 1, 'Expected exactly one app')
        app = apps[0]
        print('Verifying exported code signature.', flush=True)
        run(['codesign', '--verify', '--deep', '--strict', app], child_env)
        print('Inspecting signed entitlements.', flush=True)
        ent = plistlib.loads(run(['codesign', '-d', '--entitlements', ':-', app], child_env))
        require(ent.get('application-identifier') == team + '.' + APP
                and ent.get('com.apple.developer.team-identifier') == team
                and ent.get('get-task-allow', False) is False, 'Wrong signed entitlements')
        embedded = plistlib.loads(run(['security', 'cms', '-D', '-i', app / 'embedded.mobileprovision'], child_env))
        require(validate_profile(embedded) == team and embedded['UUID'] == uuid, 'Wrong embedded profile')
        prefix = root / 'leaf'
        print('Extracting signing certificate for comparison.', flush=True)
        # Optional long-option values must use =; otherwise prefix is a code path.
        run(['codesign', '-d', '--extract-certificates=' + str(prefix), app], child_env)
        require(Path(str(prefix) + '0').read_bytes() in p['DeveloperCertificates'], 'Wrong signing certificate')
        info = plistlib.loads((app / 'Info.plist').read_bytes())
        require(info.get('CFBundleIdentifier') == APP and info.get('CFBundleVersion') == build,
                'Wrong exported app ID/build')
        require('STG' in info.get('CFBundleDisplayName', ''), 'Missing staging label')
        privacy = plistlib.loads((app / 'PrivacyInfo.xcprivacy').read_bytes())
        require(privacy.get('NSPrivacyTracking') is False, 'Unexpected privacy tracking')
        require(any(x.get('NSPrivacyAccessedAPIType') == 'NSPrivacyAccessedAPICategoryFileTimestamp'
                    and 'C617.1' in x.get('NSPrivacyAccessedAPITypeReasons', [])
                    for x in privacy.get('NSPrivacyAccessedAPITypes', [])), 'Missing timestamp privacy reason')
        check_assets(app / 'public', key)
        digest = hashlib.sha256(ipas[0].read_bytes()).hexdigest()
        summary = ('iOS staging signing/export verification passed.\n\n'
                   f'Commit: {os.environ["GITHUB_SHA"]}\n\nBuild: {build}\n\nIPA SHA256: {digest}\n\n'
                   'No upload or distribution. IPA and signing files removed after validation.\n')
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
            f.write(summary)
        print('Signature, profile, ID, staging assets and privacy checks passed. No upload.')
    finally:
        if old_chains is not None:
            subprocess.run(['security', 'list-keychains', '-d', 'user', '-s', *old_chains],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if keychain.exists():
            result = subprocess.run(['security', 'delete-keychain', str(keychain)],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if result.returncode:
                print('Keychain cleanup failed; hosted runner teardown required.', file=sys.stderr)
        if installed and installed.exists():
            installed.unlink()
        shutil.rmtree(root)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # No traceback/locals or private tool output in public job logs.
        print('Signing check failed: ' + (str(error) if isinstance(error, (ValueError, RuntimeError))
              else type(error).__name__), file=sys.stderr)
        sys.exit(1)

