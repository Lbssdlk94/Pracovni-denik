"""Pair ONLY the ephemeral simulators selected in this GitHub Actions job."""
import json,subprocess,sys
watch,phone=sys.argv[1:]
pairs=json.loads(subprocess.check_output(['xcrun','simctl','list','pairs','-j']))['pairs']
selected=None
for pair_id,value in pairs.items():
    if value.get('watch',{}).get('udid')==watch:
        if value.get('phone',{}).get('udid')==phone:selected=pair_id
        else:subprocess.run(['xcrun','simctl','unpair',pair_id],check=True)
if not selected:selected=subprocess.check_output(['xcrun','simctl','pair',watch,phone],text=True).strip()
subprocess.run(['xcrun','simctl','pair_activate',selected],check=True)
print('Selected Watch/iPhone simulator pair activated')
