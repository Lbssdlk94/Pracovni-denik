"""Choose a real installed watchOS simulator, without assuming its model name."""
import json,sys
for runtime,devices in sorted(json.load(sys.stdin)['devices'].items(),reverse=True):
    if 'watchOS' in runtime:
        for device in devices:
            if device['isAvailable'] and 'Apple Watch' in device['name']:
                print(device['udid']);sys.exit(0)
raise SystemExit('No available Apple Watch simulator')
