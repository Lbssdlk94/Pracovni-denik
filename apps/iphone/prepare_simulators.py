"""Create isolated CI devices; never reuse an auto-managed foldable pair."""
import json,os,re,subprocess
from simulator_selection import select_simulator

def portrait_type(types):
    candidates=[d for d in types if d['name'].startswith('iPhone') and not any(v in d['name'].lower() for v in ('duo','fold'))]
    if not candidates:raise ValueError('No conventional iPhone device type available')
    def rank(d):
        name=d['name'];generation=re.search(r'iPhone\s+(\d+)',name)
        return (int(generation[1]) if generation else 0,'Pro' in name,'Max' not in name)
    return max(candidates,key=rank)

def prepare():
    def read(*args):return json.loads(subprocess.check_output(['xcrun','simctl',*args],text=True))
    devices=read('list','devices','available','-j');types=read('list','devicetypes','-j')['devicetypes']
    output={}
    for platform,label in [('iOS','phone'),('watchOS','watch')]:
        sdk='iphonesimulator' if label=='phone' else 'watchsimulator'
        major=int(subprocess.check_output(['xcrun','--sdk',sdk,'--show-sdk-version'],text=True).split('.')[0])
        chosen=select_simulator(devices,platform,major)
        runtime,original=next((runtime,d) for runtime,rows in devices['devices'].items() for d in rows if d['udid']==chosen)
        kind=portrait_type(types) if label=='phone' else next(d for d in types if d['identifier']==original.get('deviceTypeIdentifier') or d['name']==original['name'])
        fresh=subprocess.check_output(['xcrun','simctl','create','Diary CI '+label,kind['identifier'],runtime],text=True).strip()
        output[label]=fresh;print(label+': '+kind['name']+' / '+runtime)
    with open(os.environ['GITHUB_ENV'],'a') as f:
        for key,value in output.items():f.write('DIARY_'+key.upper()+'_SIMULATOR_ID='+value+'\n')
    os.makedirs('build',exist_ok=True)
    with open('build/simulator-devices.json','w') as f:json.dump(output,f)
if __name__=='__main__':prepare()
