"""Inspect the actually embedded, built watchOS companion, never a source mock."""
import pathlib,plistlib,sys
phone=pathlib.Path(sys.argv[1]);watch=phone/'Watch'/'PracovniDenikWatch.app'
assert watch.is_dir(),'Watch companion is missing from the iPhone application'
p=plistlib.loads((watch/'Info.plist').read_bytes())
assert p['CFBundleIdentifier']=='cz.pracovnidenik.app.watchapp'
assert p['CFBundleDisplayName']=='Pracovní deník'
assert p['WKApplication'] is True
assert p['WKCompanionAppBundleIdentifier']=='cz.pracovnidenik.app'
assert p.get('WKRunsIndependentlyOfCompanionApp') is False
assert 'WatchOS' in p['CFBundleSupportedPlatforms']
assert (watch/p['CFBundleExecutable']).is_file()
assert (watch/'Assets.car').is_file(),'Compiled Watch icon missing'
assert plistlib.loads((watch/'PrivacyInfo.xcprivacy').read_bytes())['NSPrivacyTracking'] is False
phone_info=plistlib.loads((phone/'Info.plist').read_bytes())
for key in ['CFBundleVersion','CFBundleShortVersionString']:assert p[key]==phone_info[key],key+' differs between iPhone and Watch'
print('PASS embedded watchOS executable, icon, privacy, companion identity, paired-only mode and matching versions')
