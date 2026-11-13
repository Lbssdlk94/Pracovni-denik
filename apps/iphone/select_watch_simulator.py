import argparse,json,sys
from simulator_selection import select_simulator
parser=argparse.ArgumentParser();parser.add_argument('--sdk-major',type=int);args=parser.parse_args()
try: print(select_simulator(json.load(sys.stdin),'watchOS',args.sdk_major))
except ValueError as error: raise SystemExit(str(error))
