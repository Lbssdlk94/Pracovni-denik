"""Choose an installed runtime compatible with the selected SDK, numerically."""
import re

def select_simulator(payload, platform, sdk_major=None):
    runtimes = []
    for runtime, devices in payload.get('devices', {}).items():
        match = re.search(r'SimRuntime\.' + re.escape(platform) + r'-(\d+)(?:-(\d+))?', runtime)
        if not match:
            continue
        major, minor = int(match[1]), int(match[2] or 0)
        if sdk_major is not None and major > sdk_major:
            continue
        runtimes.append(((major, minor), devices))
    prefix = 'iPhone' if platform == 'iOS' else 'Apple Watch'
    for _, devices in sorted(runtimes, key=lambda entry: entry[0], reverse=True):
        for device in devices:
            if device.get('isAvailable') and device.get('name', '').startswith(prefix):
                return device['udid']
    raise ValueError('No available compatible ' + prefix + ' simulator')
