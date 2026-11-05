import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from prepare_simulators import portrait_type
class PortraitDeviceTypeTests(unittest.TestCase):
    def test_prefers_current_conventional_pro_without_max(self):
        names=['iPhone Duo','iPhone 17 Pro','iPhone 18 Pro Max','iPhone 18 Pro']
        self.assertEqual(portrait_type([{'name':n,'identifier':n} for n in names])['name'],'iPhone 18 Pro')
    def test_never_mislabels_duo_as_conventional(self):
        with self.assertRaises(ValueError):portrait_type([{'name':'iPhone Duo','identifier':'duo'}])
    def test_supported_existing_type_is_kept_verbatim(self):
        value={'name':'iPhone 17','identifier':'actual-returned-identifier'}
        self.assertEqual(portrait_type([value]),value)
if __name__=='__main__':unittest.main()
