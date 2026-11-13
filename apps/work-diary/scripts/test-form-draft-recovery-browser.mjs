// Real form/input/File objects with injected storage errors on loopback only.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json')('playwright'));}
const server=createServer(async(req,res)=>{
 if(new URL(req.url,'http://localhost').pathname==='/form-drafts.js'){res.setHeader('content-type','text/javascript');res.end(await readFile('web/form-drafts.js'));return;}
 res.setHeader('content-type','text/html');res.end('<!doctype html><title>Isolated draft recovery</title><dialog open><form><textarea name="notes"></textarea><input name="photo" type="file"></form></dialog>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const width of [360,390,430,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
   const lib=await import('/form-drafts.js?v=draft-recovery-v1');window.lib=lib;window.actor={id:'test-owner',role:'owner'};window.failWrites=true;window.saved=null;
   const db={session:()=>({user:actor}),getFormDraft:async()=>saved,putFormDraft:async(key,version,value)=>{if(failWrites)throw new DOMException('Quota exceeded','QuotaExceededError');saved={baseVersion:version,value};},removeFormDraft:async()=>{saved=null;}};
   window.db=db;window.draft=lib.attachFormDraft({db,form:document.querySelector('form'),key:'test-form'});await draft.ready;
  });
  await page.locator('textarea').fill('LATEST_UNSAVED_TEXT');await page.locator('input[type=file]').setInputFiles({name:'original-photo.jpg',mimeType:'image/jpeg',buffer:Buffer.from('ORIGINAL_SELECTED_FILE')});
  const failed=await page.evaluate(async()=>{await draft.flush();const captured=lib.captureActiveFormDrafts();return {count:captured.length,notes:captured[0]?.value.fields.find(f=>f.key==='notes').value,file:await captured[0]?.selectedFiles[0]?.file.text(),warning:document.querySelector('.form-draft-status').textContent,durable:saved};});
  assert.equal(failed.count,1);assert.equal(failed.notes,'LATEST_UNSAVED_TEXT');assert.equal(failed.file,'ORIGINAL_SELECTED_FILE');assert.equal(failed.durable,null);assert.match(failed.warning,/nepodařilo/);
  await page.evaluate(()=>{failWrites=false;});await page.locator('textarea').fill('NEWER_SAVED_TEXT');
  const stored=await page.evaluate(async()=>{await draft.flush();const captured=lib.captureActiveFormDrafts();return {count:captured.length,notes:captured[0]?.value.fields.find(f=>f.key==='notes').value,file:await captured[0]?.selectedFiles[0]?.file.text(),durable:saved.value.fields.find(f=>f.key==='notes').value};});
  assert.deepEqual(stored,{count:1,notes:'NEWER_SAVED_TEXT',file:'ORIGINAL_SELECTED_FILE',durable:'NEWER_SAVED_TEXT'});
  const switched=await page.evaluate(()=>{actor={id:'different-user',role:'worker'};return lib.captureActiveFormDrafts().length;});assert.equal(switched,0,'capture exposed another account form');
  await page.evaluate(async()=>{actor={id:'test-owner',role:'owner'};await draft.saved();});assert.equal(await page.evaluate(()=>lib.captureActiveFormDrafts().length),0,'saved form stayed in recovery');
  // Restoring a draft dispatches input while restoring=true. It still needs to
  // remain recoverable after a successful local flush and until explicit save.
  await page.reload();await page.evaluate(async()=>{
   const lib=await import('/form-drafts.js?v=draft-recovery-v1');window.lib=lib;let saved={baseVersion:1,value:{fields:[{key:'notes',n:0,value:'RESTORED_TEXT'}]}};
   const db={session:()=>({user:{id:'test-owner',role:'owner'}}),getFormDraft:async()=>saved,putFormDraft:async(key,version,value)=>{saved={baseVersion:version,value};},removeFormDraft:async()=>{saved=null;}};
   window.draft=lib.attachFormDraft({db,form:document.querySelector('form'),key:'restored',version:1});await draft.ready;
  });
  await page.locator('[data-draft-restore]').click();const restored=await page.evaluate(async()=>{await draft.flush();return lib.captureActiveFormDrafts().map(row=>row.value.fields.find(f=>f.key==='notes').value);});assert.deepEqual(restored,['RESTORED_TEXT']);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS Chromium360/390/430/1440: failed local writes retain latest form and original File for recovery; successful metadata flush retains selected File; restored form remains recoverable; saved form and other-account form are excluded. Synthetic storage only.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
