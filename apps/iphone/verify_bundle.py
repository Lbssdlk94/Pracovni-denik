"""Fail packaging if the real device bundle lacks its icon, privacy or origin policy."""
import pathlib
import plistlib
import sys

bundle = pathlib.Path(sys.argv[1])
with (bundle / 'Info.plist').open('rb') as stream:
    info = plistlib.load(stream)
assert info['NativePushEnvironment'] == 'production', 'Release APNs environment missing'
assert info['CFBundleIdentifier'] == 'cz.pracovnidenik.app'
assert info['CFBundleDisplayName'] == 'Pracovní deník'
assert 'WKAppBoundDomains' not in info, 'Legacy embedded browser configuration remains'
assert not any(p.suffix.lower() in {'.js', '.html', '.htm'} for p in bundle.rglob('*')), 'Executable web UI is bundled'
import subprocess
links = subprocess.check_output(['otool', '-L', str(bundle / info['CFBundleExecutable'])], text=True)
assert '/WebKit.framework/' not in links, 'Native app still links WebKit'
assert info['CFBundleIcons']['CFBundlePrimaryIcon']['CFBundleIconName'] == 'AppIcon'
assert (bundle / 'Assets.car').is_file(), 'Compiled approved icon/launch assets missing'
assert (bundle / info['CFBundleExecutable']).is_file(), 'Device binary missing'
with (bundle / 'PrivacyInfo.xcprivacy').open('rb') as stream:
    privacy = plistlib.load(stream)
assert privacy['NSPrivacyTracking'] is False
assert privacy['NSPrivacyCollectedDataTypes'], 'Review privacy inventory before distribution'
assert info['NSCameraUsageDescription'] and info['NSLocationWhenInUseUsageDescription']
print('Device bundle verified: executable, icon, privacy manifest and no embedded web runtime')
