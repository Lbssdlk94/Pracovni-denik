import test from 'node:test';import assert from 'node:assert/strict';
import {parseMapPosition,appleMapLink,addressNavigationLink,preferredMapProvider} from '../web/map-links.js';
test('Apple pin coordinates and copied coordinates preserve latitude and longitude',()=>{
 for(const source of ['50.087, 14.421','50,087 14,421','https://maps.apple.com/?ll=50.087%2C14.421&q=Šachta','https://maps.apple.com/place?coordinate=50.087%2C14.421','https://maps.apple.com/?q=50.087%2C14.421'])assert.deepEqual(parseMapPosition(source),{latitude:50.087,longitude:14.421,accuracy:null});
 const link=appleMapLink({latitude:50.087,longitude:14.421},'Šachta & záhony');assert.equal(new URL(link).searchParams.get('q'),'Šachta & záhony');assert.deepEqual(parseMapPosition(link),{latitude:50.087,longitude:14.421,accuracy:null});
 assert.deepEqual(parseMapPosition('-33.8, 151.2'),{latitude:-33.8,longitude:151.2,accuracy:null});assert.deepEqual(parseMapPosition('0,0'),{latitude:0,longitude:0,accuracy:null});
});
test('Missing or invalid coordinates and unrelated links cannot create a false pin',()=>{
 for(const source of ['',',','91,14','50,-181','https://maps.apple.com/?ll=not-a-point','https://maps.apple/p/short-pin','https://example.com/?ll=50,14','javascript:alert(1)','https://maps.apple.com.evil.example/?ll=50,14','https://user:password@maps.apple.com/?ll=50,14','https://maps.apple.com/?q=Praha'])assert.throws(()=>parseMapPosition(source));
});

test('Customer address directions preserve Czech text and choose Apple or Google without requesting GPS',()=>{
 assert.equal(preferredMapProvider({userAgent:'Mozilla/5.0 (iPhone)'}),'apple');assert.equal(preferredMapProvider({userAgent:'Mozilla/5.0 (Linux; Android 15)'}),'google');
 const destination='Dlouhá 12 & zahrada č. 3, České Budějovice',apple=new URL(addressNavigationLink('Dlouhá 12 & zahrada č. 3','České Budějovice','apple')),google=new URL(addressNavigationLink('Dlouhá 12 & zahrada č. 3','České Budějovice','google'));assert.equal(apple.origin,'https://maps.apple.com');assert.equal(apple.searchParams.get('daddr'),destination);assert.equal(apple.searchParams.get('dirflg'),'d');assert.equal(google.searchParams.get('destination'),destination);assert.equal(google.searchParams.get('travelmode'),'driving');assert.equal(google.searchParams.get('api'),'1');assert.equal(addressNavigationLink('  ',' '),null);
});
