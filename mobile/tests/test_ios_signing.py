import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('signing', Path(__file__).parents[1] / 'scripts/ios_signing_check.py')
signing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signing)


def profile():
    return dict(TeamIdentifier=['ABCDEFGHIJ'], Platform=['iOS'],
                UUID='00000000-0000-0000-0000-000000000001',
                ExpirationDate=dt.datetime(2099, 1, 1), DeveloperCertificates=[b'synthetic'],
                Entitlements={'application-identifier': 'ABCDEFGHIJ.club.yurutore.app',
                              'com.apple.developer.team-identifier': 'ABCDEFGHIJ',
                              'get-task-allow': False, 'beta-reports-active': True})


class ProfileTests(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(signing.validate_profile(profile()), 'ABCDEFGHIJ')

    def test_reject_wrong_app_debug_expired_device_and_invalid_uuid(self):
        cases = []
        for field, value in [('application-identifier', 'ABCDEFGHIJ.*'),
                             ('com.apple.developer.team-identifier', 'OTHERTEAM1'),
                             ('get-task-allow', True), ('beta-reports-active', False)]:
            p = profile()
            p['Entitlements'][field] = value
            cases.append(p)
        for field, value in [('ExpirationDate', dt.datetime(2000, 1, 1)),
                             ('ProvisionedDevices', []), ('ProvisionsAllDevices', False),
                             ('UUID', '-' * 36), ('DeveloperCertificates', []),
                             ('Platform', ['macOS']), ('TeamIdentifier', [])]:
            p = profile()
            p[field] = value
            cases.append(p)
        for p in cases:
            with self.subTest(profile=p), self.assertRaises(ValueError):
                signing.validate_profile(p)

    def test_target_patch_only_changes_release(self):
        text = ('unchanged debug CODE_SIGN_STYLE = Automatic;\n'
                '504EC3181FED79650016851F /* Release */ = {\n'
                'buildSettings = {\nCODE_SIGN_STYLE = Automatic;\n'
                'CURRENT_PROJECT_VERSION = 1;\n\t\t\t};\n};')
        result = signing.patch_project(text, 'ABCDEFGHIJ', profile()['UUID'], '2')
        self.assertTrue(result.startswith('unchanged debug CODE_SIGN_STYLE = Automatic;'))
        self.assertIn('CURRENT_PROJECT_VERSION = 2;', result)
        self.assertEqual(result.count('PROVISIONING_PROFILE_SPECIFIER'), 1)
        for build in ['0', '1; bad', '', '-1', '1234567890']:
            with self.subTest(build=build), self.assertRaises(ValueError):
                signing.patch_project(text, 'ABCDEFGHIJ', profile()['UUID'], build)
        with self.assertRaises(ValueError):
            signing.patch_project('unknown project', 'ABCDEFGHIJ', profile()['UUID'], '2')

    def test_assets_refuse_production_dummy_and_wrong_key(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            (p / 'build-info.json').write_text(json.dumps(dict(target='staging', appId=signing.APP, supabaseUrl=signing.STAGING)))
            (p / 'native-config.js').write_text('{"redirectUrl":"club.yurutore.app://auth/callback"}')
            key = 'sb_publishable_testkey123456'
            (p / 'app.bundle.js').write_text(key)
            signing.check_assets(p, key)
            for body in [key + signing.PRODUCTION_REF, key + 'CI_COMPILE_ONLY', 'wrong key', key + 'sb_secret_123456789']:
                (p / 'app.bundle.js').write_text(body)
                with self.subTest(body=body), self.assertRaises(ValueError):
                    signing.check_assets(p, key)


if __name__ == '__main__':
    unittest.main()
