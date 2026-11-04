import json,sys
for runtime,devices in sorted(json.load(sys.stdin)['devices'].items(),reverse=True):
    if 'iOS' in runtime:
        for d in devices:
            if d['isAvailable'] and d['name'].startswith('iPhone'):
                print(d['udid']);sys.exit(0)
raise SystemExit('No available iPhone simulator')
