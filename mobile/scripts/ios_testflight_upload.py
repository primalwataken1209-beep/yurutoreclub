"""Inactive until explicitly invoked: upload a locally verified staging IPA only."""
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

import ios_signing_check as signing

ACK = 'UPLOAD_STAGING_ONLY'


def validate_request(env):
    signing.require(env.get('YT_UPLOAD_APPROVAL') == ACK, 'Upload approval missing')
    signing.require(env.get('YT_DISTRIBUTION_REVIEWED') == 'true',
                    'Review TestFlight automatic distribution before upload')
    sha = env.get('GITHUB_SHA', '')
    signing.require(re.fullmatch(r'[0-9a-f]{40}', sha) is not None
                    and env.get('YT_REVIEWED_SHA') == sha, 'Reviewed commit mismatch')
    signing.require(env.get('GITHUB_REF') == 'refs/heads/claude/store-release-prep',
                    'Wrong upload branch')
    signing.require(env.get('GITHUB_ACTIONS') == 'true', 'Actions runner required')
    signing.require(re.fullmatch(r'[A-Z0-9]{10}', env.get('ASC_KEY_ID', '')) is not None,
                    'Invalid API key ID')
    signing.require(re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}',
                                env.get('ASC_ISSUER_ID', '')) is not None,
                    'Team API issuer ID required')


def upload_verified(ipa, expected_digest, key_id, issuer, private_key, runner_temp, summary):
    signing.require(hashlib.sha256(ipa.read_bytes()).hexdigest() == expected_digest,
                    'IPA changed after verification')
    signing.require(private_key.startswith('-----BEGIN PRIVATE KEY-----')
                    and private_key.rstrip().endswith('-----END PRIVATE KEY-----'),
                    'Expected PKCS8 API private key')
    # Only system environment; no signing or API secret variables enter altool.
    env = {k: os.environ[k] for k in ('PATH', 'HOME', 'TMPDIR', 'DEVELOPER_DIR') if k in os.environ}
    with tempfile.TemporaryDirectory(prefix='yt-upload-', dir=runner_temp) as directory:
        os.chmod(directory, 0o700)
        key_path = Path(directory) / ('AuthKey_' + key_id + '.p8')
        key_path.write_text(private_key)
        os.chmod(key_path, 0o600)
        env['API_PRIVATE_KEYS_DIR'] = directory
        common = ['xcrun', 'altool', '--type', 'ios', '--file', str(ipa),
                  '--apiKey', key_id, '--apiIssuer', issuer, '--output-format', 'json']
        for operation in ('--validate-app', '--upload-app'):
            print('Apple binary validation.' if operation == '--validate-app'
                  else 'Uploading verified staging IPA to Apple.', flush=True)
            result = subprocess.run(common + [operation], env=env,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    timeout=1200)
            # Do not publish Apple's raw responses, account metadata or credentials.
            signing.require(result.returncode == 0,
                            'Apple validation/upload failed; inspect Connect before retrying')
    with open(summary, 'a') as f:
        f.write('\nApple upload command succeeded. Processing/tester availability NOT confirmed.\n'
                'No tester invitation, group assignment, beta review or release request sent by this script.\n')


def main():
    signing.require(sys.argv[1:] == ['--upload'], 'Explicit --upload required')
    signing.require(sys.platform == 'darwin', 'macOS required')
    validate_request(os.environ)
    key_id = os.environ.pop('ASC_KEY_ID')
    issuer = os.environ.pop('ASC_ISSUER_ID')
    private_key = os.environ.pop('ASC_PRIVATE_KEY_P8')
    # Signing checks execute first; their subprocesses cannot inherit upload secrets.
    def upload(ipa, digest):
        upload_verified(ipa, digest, key_id, issuer, private_key,
                        os.environ['RUNNER_TEMP'], os.environ['GITHUB_STEP_SUMMARY'])
    signing.main(verified_ipa_callback=upload)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Upload stopped: ' + (str(error) if isinstance(error, ValueError)
                                   else type(error).__name__), file=sys.stderr)
        sys.exit(1)

