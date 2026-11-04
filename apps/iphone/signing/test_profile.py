import copy
import datetime
import unittest
from prepare_profile import configuration


class SigningPolicyTest(unittest.TestCase):
    def profile(self):
        return {'UUID': '00000000-1111-2222-3333-444444444444', 'TeamIdentifier': ['TEAM123456'], 'ExpirationDate': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7), 'ProvisionedDevices': ['synthetic-test-device'], 'Entitlements': {'application-identifier': 'TEAM123456.cz.pracovnidenik.app', 'aps-environment': 'production'}}

    def test_distribution_and_development(self):
        p = self.profile()
        self.assertEqual(configuration(p)[2:], ('production', 'release-testing'))
        p['Entitlements'].update({'get-task-allow': True, 'aps-environment': 'development'})
        self.assertEqual(configuration(p)[2:], ('development', 'debugging'))

    def test_missing_capability_wrong_bundle_expiry_and_mismatch_reject(self):
        original = self.profile()
        for key, value in [('aps-environment', None), ('application-identifier', 'TEAM123456.*'), ('aps-environment', 'development')]:
            p = copy.deepcopy(original)
            p['Entitlements'][key] = value
            with self.assertRaises(ValueError):
                configuration(p)
        p = self.profile()
        p['ExpirationDate'] = datetime.datetime(2020, 1, 1)
        with self.assertRaises(ValueError):
            configuration(p)

class WatchProfileTests(unittest.TestCase):
    def profile(self):
        return {'TeamIdentifier':['ABCDE12345'],'UUID':'12345678-1234-1234-1234-123456789abc','ExpirationDate':datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=30),'Entitlements':{'application-identifier':'ABCDE12345.cz.pracovnidenik.app.watchapp','get-task-allow':True},'ProvisionedDevices':['watch-test']}
    def test_watch_profile_requires_exact_watch_bundle_and_matching_distribution(self):
        p=self.profile();self.assertEqual(configuration(p,'cz.pracovnidenik.app.watchapp',False)[2],'development')
        p['Entitlements']['application-identifier']='ABCDE12345.*'
        with self.assertRaises(ValueError):configuration(p,'cz.pracovnidenik.app.watchapp',False)
    def test_watch_profile_cannot_replace_the_push_enabled_iphone_profile(self):
        with self.assertRaises(ValueError):configuration(self.profile())
