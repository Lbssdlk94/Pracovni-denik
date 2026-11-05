import json,pathlib,subprocess,sys,unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from pair_watch_simulators import ensure_pair

def listing(state):return json.dumps({'pairs':{'pair':{'state':state,'watch':{'udid':'watch'},'phone':{'udid':'phone'}}}}).encode()
class SimulatorPairingTests(unittest.TestCase):
    @patch('pair_watch_simulators.subprocess.run')
    @patch('pair_watch_simulators.subprocess.check_output')
    def test_already_active_pair_needs_no_activation(self,output,run):
        output.return_value=listing('(active, disconnected)')
        self.assertEqual(ensure_pair('watch','phone'),'pair');run.assert_not_called()
    @patch('pair_watch_simulators.subprocess.run')
    @patch('pair_watch_simulators.subprocess.check_output')
    def test_inactive_pair_is_activated_and_verified(self,output,run):
        output.side_effect=[listing('(inactive)'),listing('(inactive)'),listing('(active, connected)')]
        run.return_value=subprocess.CompletedProcess([],0)
        self.assertEqual(ensure_pair('watch','phone'),'pair');self.assertEqual(run.call_args.args[0][-2:],['pair_activate','pair'])
    @patch('pair_watch_simulators.subprocess.run')
    @patch('pair_watch_simulators.subprocess.check_output')
    def test_auto_activation_race_is_accepted_only_after_state_verification(self,output,run):
        output.side_effect=[listing('(inactive)'),listing('(inactive)'),listing('(active, disconnected)')]
        run.return_value=subprocess.CompletedProcess([],37,'','already active')
        self.assertEqual(ensure_pair('watch','phone'),'pair')
    @patch('pair_watch_simulators.subprocess.run')
    @patch('pair_watch_simulators.subprocess.check_output')
    def test_real_activation_failure_is_not_ignored(self,output,run):
        output.return_value=listing('(inactive)');run.return_value=subprocess.CompletedProcess([],37,'','not active')
        with self.assertRaises(subprocess.CalledProcessError):ensure_pair('watch','phone')
if __name__=='__main__':unittest.main()
