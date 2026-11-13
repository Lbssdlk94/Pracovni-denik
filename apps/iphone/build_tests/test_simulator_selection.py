import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from simulator_selection import select_simulator

def device(name,udid,available=True): return {'name':name,'udid':udid,'isAvailable':available}
class SimulatorSelectionTests(unittest.TestCase):
    def test_newer_installed_runtime_does_not_break_older_sdk(self):
        data={'devices':{'com.apple.CoreSimulator.SimRuntime.iOS-27-0':[device('iPhone 18','future')],'com.apple.CoreSimulator.SimRuntime.iOS-26-6':[device('iPhone 17','compatible')]}}
        self.assertEqual(select_simulator(data,'iOS',26),'compatible')
        self.assertEqual(select_simulator(data,'iOS',27),'future')
    def test_numeric_sort_and_disabled_devices(self):
        data={'devices':{'com.apple.CoreSimulator.SimRuntime.iOS-9-0':[device('iPhone 6','old')],'com.apple.CoreSimulator.SimRuntime.iOS-27-1':[device('iPhone 18','unavailable',False),device('iPhone 18 Pro','real')]}}
        self.assertEqual(select_simulator(data,'iOS',27),'real')
    def test_watch_ignores_phone_runtime_and_respects_sdk(self):
        data={'devices':{'com.apple.CoreSimulator.SimRuntime.iOS-27-0':[device('iPhone 18','phone')],'com.apple.CoreSimulator.SimRuntime.watchOS-27-0':[device('Apple Watch','new-watch')],'com.apple.CoreSimulator.SimRuntime.watchOS-26-0':[device('Apple Watch','watch')]}}
        self.assertEqual(select_simulator(data,'watchOS',26),'watch')
    def test_standard_portrait_phone_preferred_but_foldable_remains_a_valid_fallback(self):
        data={'devices':{'com.apple.CoreSimulator.SimRuntime.iOS-27-1':[device('iPhone Duo','foldable'),device('iPhone 18 Pro','portrait')]}}
        self.assertEqual(select_simulator(data,'iOS',27),'portrait')
        data['devices']['com.apple.CoreSimulator.SimRuntime.iOS-27-1'].pop()
        self.assertEqual(select_simulator(data,'iOS',27),'foldable')
    def test_foldable_only_patch_runtime_does_not_hide_conventional_same_major(self):
        data={'devices':{'com.apple.CoreSimulator.SimRuntime.iOS-27-1':[device('iPhone Duo','foldable')],'com.apple.CoreSimulator.SimRuntime.iOS-27-0':[device('iPhone 18 Pro','portrait')]}}
        self.assertEqual(select_simulator(data,'iOS',27),'portrait')
    def test_missing_compatible_runtime_fails_instead_of_selecting_unsupported_one(self):
        with self.assertRaises(ValueError): select_simulator({'devices':{'com.apple.CoreSimulator.SimRuntime.iOS-27-0':[device('iPhone 18','future')]}},'iOS',26)
if __name__=='__main__': unittest.main()
