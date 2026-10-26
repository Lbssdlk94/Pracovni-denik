import test from 'node:test';import assert from 'node:assert/strict';
import {staticAssetResponse} from '../worker/static-assets.js';
const asset={type:'text/javascript; charset=utf-8',data:btoa('export const n=1;'),etag:'"current-file"'};
test('Public assets revalidate by content, including weak and multiple validators',async()=>{
 const request=(headers={},method='GET')=>new Request('https://isolated.test/app.js?v=stable-name',{headers,method});
 const first=staticAssetResponse(request(),asset);assert.equal(first.status,200);assert.equal(await first.text(),'export const n=1;');assert.equal(first.headers.get('etag'),asset.etag);assert.match(first.headers.get('cache-control'),/max-age=0, must-revalidate/);
 for(const value of ['"current-file"','W/"current-file"','"older-file", W/"current-file"','*']){const r=staticAssetResponse(request({'if-none-match':value}),{...asset,data:'deliberately-not-base64'});assert.equal(r.status,304);assert.equal(await r.text(),'');}
 const changed=staticAssetResponse(request({'if-none-match':'"old-file"'}),asset);assert.equal(changed.status,200);assert.equal(await changed.text(),'export const n=1;');
 assert.equal(await staticAssetResponse(request({},'HEAD'),{...asset,data:'deliberately-not-base64'}).text(),'');assert.equal(staticAssetResponse(request({},'POST'),asset).status,405);
 assert.equal(staticAssetResponse(new Request('https://isolated.test/sw.js'),asset).headers.get('cache-control'),'no-cache');
});
