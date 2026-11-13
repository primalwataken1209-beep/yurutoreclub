import hashlib
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
import ios_testflight_upload as upload


class UploadTests(unittest.TestCase):
    def test_request_requires_exact_approval_sha_branch_and_distribution_review(self):
        env = dict(YT_UPLOAD_APPROVAL=upload.ACK, YT_DISTRIBUTION_REVIEWED='true',
                   GITHUB_SHA='a' * 40, YT_REVIEWED_SHA='a' * 40, GITHUB_ACTIONS='true',
                   GITHUB_REF='refs/heads/claude/store-release-prep',
                   ASC_KEY_ID='ABCDEFGHIJ', ASC_ISSUER_ID='00000000-0000-0000-0000-000000000001')
        upload.validate_request(env)
        for key in env:
            with self.subTest(key=key), self.assertRaises(ValueError):
                upload.validate_request({**env, key: ''})

    def test_changed_ipa_never_invokes_apple(self):
        with tempfile.TemporaryDirectory() as d, patch.object(upload.subprocess, 'run') as run:
            ipa = Path(d) / 'test.ipa'
            ipa.write_bytes(b'changed')
            with self.assertRaises(ValueError):
                upload.upload_verified(ipa, 'wrong', 'ABCDEFGHIJ', 'issuer', 'key', d, Path(d) / 'summary')
            run.assert_not_called()

    def test_validate_before_upload_cleanup_and_secret_environment(self):
        for fail_validation in (False, True):
            with self.subTest(fail=fail_validation), tempfile.TemporaryDirectory() as d:
                ipa = Path(d) / 'test.ipa'
                ipa.write_bytes(b'synthetic')
                calls, paths = [], []
                key = '-----BEGIN PRIVATE KEY-----\nsynthetic\n-----END PRIVATE KEY-----'
                def fake(args, **kwargs):
                    calls.append(args[-1])
                    env = kwargs['env']
                    self.assertNotIn('ASC_PRIVATE_KEY_P8', env)
                    self.assertNotIn('IOS_DISTRIBUTION_P12_PASSWORD', env)
                    p = Path(env['API_PRIVATE_KEYS_DIR']) / 'AuthKey_ABCDEFGHIJ.p8'
                    self.assertEqual(p.read_text(), key)
                    paths.append(p)
                    return subprocess.CompletedProcess(args, 1 if fail_validation else 0)
                with patch.object(upload.subprocess, 'run', side_effect=fake):
                    args = (ipa, hashlib.sha256(ipa.read_bytes()).hexdigest(), 'ABCDEFGHIJ',
                            '00000000-0000-0000-0000-000000000001', key, d, Path(d) / 'summary')
                    if fail_validation:
                        with self.assertRaises(ValueError):
                            upload.upload_verified(*args)
                    else:
                        upload.upload_verified(*args)
                self.assertEqual(calls, ['--validate-app'] if fail_validation else ['--validate-app', '--upload-app'])
                self.assertTrue(paths and all(not p.exists() for p in paths))


if __name__ == '__main__':
    unittest.main()

