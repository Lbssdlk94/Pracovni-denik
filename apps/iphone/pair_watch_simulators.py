"""Pair ONLY the ephemeral simulators selected in this GitHub Actions job."""
import json,re,subprocess,sys

def active(pair):
    return pair.get('active') is True or bool(re.search(r'\bactive\b',str(pair.get('state','')),re.I))

def ensure_pair(watch,phone):
    def pairs(): return json.loads(subprocess.check_output(['xcrun','simctl','list','pairs','-j']))['pairs']
    selected=None
    for pair_id,value in pairs().items():
        if value.get('watch',{}).get('udid')==watch:
            if value.get('phone',{}).get('udid')==phone:selected=pair_id
            else:subprocess.run(['xcrun','simctl','unpair',pair_id],check=True)
    if not selected:selected=subprocess.check_output(['xcrun','simctl','pair',watch,phone],text=True).strip()
    current=pairs().get(selected,{})
    if not active(current):
        result=subprocess.run(['xcrun','simctl','pair_activate',selected],capture_output=True,text=True)
        # simctl may activate a newly created pair itself. Verify the requested
        # pair's actual state, including the already-active race, not exit 37 alone.
        current=pairs().get(selected,{})
        if not active(current):
            if result.returncode:raise subprocess.CalledProcessError(result.returncode,result.args,output=result.stdout,stderr=result.stderr)
            raise RuntimeError('Selected simulator pair did not become active')
    if current.get('watch',{}).get('udid')!=watch or current.get('phone',{}).get('udid')!=phone:
        raise RuntimeError('Active simulator pair does not match the selected devices')
    return selected

if __name__=='__main__':
    ensure_pair(*sys.argv[1:]);print('Selected Watch/iPhone simulator pair activated')
