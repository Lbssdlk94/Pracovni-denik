import assert from 'node:assert/strict';
import test from 'node:test';
import {createLocalMinistral, extractLocalCommand} from '../web/assistant-local.js';

test('Local model output becomes one command or stays a sentence', ()=>{
  assert.equal(extractLocalCommand('{"command":"Najdi zákazníka Petřík"}'), 'Najdi zákazníka Petřík');
  assert.equal(extractLocalCommand('Poznámka\n{"command":"Co máme dnes za práci?"}\n'), 'Co máme dnes za práci?');
  assert.equal(extractLocalCommand('Dnes nevím a nic si nevymýšlím.'), null);
  assert.equal(extractLocalCommand('{"command":""}'), null);
  assert.equal(extractLocalCommand('{"command":"řádek\\ndruhý"}'), null);
});

function memoryStorage(){
  let bytes = null;
  return {
    async size(){return bytes?.length||0;},
    async file(){return new Blob([bytes]);},
    async remove(){bytes = null;},
    async write(response, onProgress, signal){
      const reader = response.body.getReader();
      const chunks = [];
      let got = 0;
      while(true){
        if(signal?.aborted) throw Object.assign(Error('zrušeno'), {name:'AbortError'});
        const step = await reader.read();
        if(step.done) break;
        chunks.push(step.value);
        got += step.value.byteLength;
        onProgress(got);
      }
      const all = new Uint8Array(got);
      let offset = 0;
      for(const chunk of chunks){all.set(chunk, offset); offset += chunk.byteLength;}
      bytes = all;
      return got;
    }
  };
}
const stream = bytes => new Response(new Uint8Array(bytes));

test('A short or low-memory download never becomes a model', async ()=>{
  const storage = memoryStorage();
  const weak = createLocalMinistral({bytes:4, storage, deviceMemory:()=>4, fetch:async ()=>{throw Error('nemělo se stahovat');}});
  await weak.start();
  assert.match(weak.snapshot().message, /8 GB/);
  assert.equal(weak.snapshot().downloading, false);
  const broken = createLocalMinistral({bytes:4, storage:memoryStorage(), deviceMemory:()=>8, fetch:async ()=>stream(2)});
  await broken.start();
  assert.match(broken.snapshot().message, /správnou velikost/);
  assert.equal(await broken.snapshot().installed, false);
  let asked = '';
  const ready = createLocalMinistral({bytes:4, storage, deviceMemory:()=>8, fetch:async ()=>stream(4), engine:async ()=>({async complete(text){asked = text; return '{"command":"Najdi zákazníka Petřík"}';}})});
  await ready.start();
  assert.equal(ready.snapshot().installed, true);
  assert.equal(await ready.answer('kde je Petřík'), '{"command":"Najdi zákazníka Petřík"}');
  assert.equal(asked, 'kde je Petřík');
  assert.equal(extractLocalCommand(await ready.answer('x')), 'Najdi zákazníka Petřík');
});
