"""Validate a decoded Apple provisioning profile; emit no certificate/token secrets."""
import datetime
import pathlib
import plistlib
import re
import sys


def configuration(profile):
    entitlements = profile.get('Entitlements', {})
    topic = 'cz.pracovnidenik.app'
    team = profile.get('TeamIdentifier', [''])[0]
    if not re.fullmatch(r'[A-Z0-9]{10}', team):
        raise ValueError('Provisioning profile has no valid Apple Team ID')
    if entitlements.get('application-identifier') != team + '.' + topic:
        raise ValueError('Provisioning profile must explicitly belong to cz.pracovnidenik.app')
    mode = entitlements.get('aps-environment')
    if mode not in ('development', 'production'):
        raise ValueError('Provisioning profile does not enable Push Notifications')
    expires = profile.get('ExpirationDate')
    if not expires or expires.replace(tzinfo=datetime.timezone.utc) <= datetime.datetime.now(datetime.timezone.utc):
        raise ValueError('Provisioning profile expired')
    uuid = profile.get('UUID', '')
    if not re.fullmatch(r'[A-Fa-f0-9-]{36}', uuid):
        raise ValueError('Provisioning profile UUID is invalid')
    method = 'debugging' if entitlements.get('get-task-allow') else 'release-testing' if profile.get('ProvisionedDevices') else 'app-store-connect'
    if method == 'debugging' and mode != 'development' or method != 'debugging' and mode != 'production':
        raise ValueError('Provisioning profile push environment does not match its distribution type')
    return team, uuid, mode, method


if __name__ == '__main__':
    profile = plistlib.loads(pathlib.Path(sys.argv[1]).read_bytes())
    team, uuid, mode, method = configuration(profile)
    output = pathlib.Path(sys.argv[2])
    output.write_bytes(plistlib.dumps({'method': method, 'destination': 'export', 'teamID': team, 'signingStyle': 'manual', 'provisioningProfiles': {'cz.pracovnidenik.app': uuid}}))
    with pathlib.Path(sys.argv[3]).open('a') as env:
        env.write(f'APPLE_TEAM_ID={team}\nAPPLE_PROFILE_UUID={uuid}\nSIGNED_APNS_ENVIRONMENT={mode}\n')
    print('Provisioning profile validated for diary bundle and APNs environment')
