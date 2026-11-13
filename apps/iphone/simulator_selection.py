"""Choose an installed compatible runtime and real available device, numerically."""
import re

def select_simulator(payload, platform, sdk_major=None):
    runtimes=[]
    for runtime,devices in payload.get('devices',{}).items():
        match=re.search(r'SimRuntime\.'+re.escape(platform)+r'-(\d+)(?:-(\d+))?',runtime)
        if not match:continue
        major,minor=int(match[1]),int(match[2] or 0)
        if sdk_major is not None and major>sdk_major:continue
        runtimes.append(((major,minor),devices))
    prefix='iPhone' if platform=='iOS' else 'Apple Watch'
    ordered=sorted(runtimes,key=lambda value:value[0],reverse=True)
    for major in sorted({version[0] for version,_ in ordered},reverse=True):
        compatible=[rows for version,rows in ordered if version[0]==major]
        # A preview patch runtime can be exclusive to a new foldable. Prefer a
        # conventional device from the same iOS major before using that runtime.
        for foldable in ([False,True] if platform=='iOS' else [False]):
            for rows in compatible:
                for device in rows:
                    if not device.get('isAvailable') or not device.get('name','').startswith(prefix):continue
                    is_foldable=platform=='iOS' and any(part in device['name'].lower() for part in ('duo','fold'))
                    if is_foldable==foldable:return device['udid']
    raise ValueError('No available compatible '+prefix+' simulator')
