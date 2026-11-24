// Ministral 3B in the browser. The file is not part of the app. The prompt is
// only the user's sentence. Company records stay on the existing assistant API.
import {ASSISTANT_INTENT_IDS, modelReadCommand} from './assistant-intent.js';
export const MODEL_BYTES = 2_147_023_008;
export const MODEL_FILE = 'Ministral-3-3B-Instruct-2512-Q4_K_M.gguf';
export const MODEL_URL = 'https://huggingface.co/mistralai/Ministral-3-3B-Instruct-2512-GGUF/resolve/main/Ministral-3-3B-Instruct-2512-Q4_K_M.gguf';
// A phone can be wider than 760 px in landscape, so width alone is not enough.
export function desktopCanRunMinistral(match){
  const query = match || (typeof globalThis.matchMedia==='function' ? globalThis.matchMedia.bind(globalThis) : null);
  if(typeof query!=='function') return false;
  try{
    return query('(min-width:761px)').matches===true && query('(hover:hover) and (pointer:fine)').matches===true;
  }catch{return false;}
}
const RUNTIME = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.13.0/esm/index.js';
const RUNTIME_WASM = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.13.0/esm/wasm-from-cdn.js';
const SYSTEM = 'Jsi pracovní asistent deníku v prohlížeči. Nevymýšlej zákazníky, hodiny, ceny, materiál ani stav zakázek. Odpověz jen jedním JSON objektem {"intent":"jeden podporovaný záměr","command":"krátký český příkaz"}. Povolené záměry: '+ASSISTANT_INTENT_IDS.join(', ')+'. Neznámý záměr nevracej. Příkaz jen pojmenuje požadavek, nic neukládá. Když se uživatel jen ptá, co umíš, odpověz česky jednou větou.';

export function extractLocalCommand(text){
  const source = String(text||'');
  const start = source.indexOf('{');
  const end = source.indexOf('}', start);
  if(start<0||end<start) return null;
  try{
    const object = JSON.parse(source.slice(start, end+1));
    const command = String(object?.command||'').trim();
    if(!command||command.length>180||command.includes('\n')) return null;
    return command;
  }catch{return null;}
}
export function extractLocalUnderstanding(text){
  const source = String(text||'');
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if(start<0||end<start) return null;
  try{
    const object = JSON.parse(source.slice(start, end+1));
    const command = extractLocalCommand(source);
    const read = modelReadCommand(object);
    if(object?.intent && !ASSISTANT_INTENT_IDS.includes(object.intent)) return null;
    if(!read && !command) return null;
    return {intent:read?.intent||'', command:command||'', read};
  }catch{return null;}
}

export function createLocalMinistral({
  bytes = MODEL_BYTES,
  storage,
  fetch: fetchImpl = globalThis.fetch,
  engine,
  deviceMemory = ()=>globalThis.navigator?.deviceMemory,
  subscribeClock = null
}={}){
  const listeners = new Set();
  let snapshot = {installed:false, downloading:false, progress:0, message:'Ministral 3B není v prohlížeči.'};
  let abort = null;
  let running = null;
  const notify = (force=false)=>{
    if(!force && snapshot.downloading && subscribeClock && !subscribeClock()) return;
    listeners.forEach(listener=>listener(snapshot));
  };
  const set = (patch, force=true)=>{snapshot={...snapshot, ...patch}; notify(force);};
  async function refresh(){
    const size = await storage.size().catch(()=>0);
    const installed = size===bytes;
    if(!installed && size>0) await storage.remove().catch(()=>{});
    if(!snapshot.downloading) set({installed, progress:installed?1:0, message:installed?'Ministral 3B je v prohlížeči. Firemní údaje dál bere ze serveru a zápis čeká na potvrzení. První odpověď může trvat minutu.':'Ministral 3B není v prohlížeči.'});
    return installed;
  }
  function blocked(){
    const memory = Number(deviceMemory());
    if(Number.isFinite(memory)&&memory>0&&memory<8) return 'Ministral 3B potřebuje zařízení s 8 GB paměti. Tady bych ho nenačetl, nic jsem nespustil.';
    return '';
  }
  async function start(){
    if(snapshot.downloading) return;
    const refusal = blocked();
    if(refusal){set({message:refusal}); return;}
    if(await refresh()) return;
    abort = new AbortController();
    set({downloading:true, progress:0, installed:false, message:'Stahuji Ministral 3B do prohlížeče, asi 2,2 GB. Na server se model neposílá.'});
    try{
      const response = await fetchImpl(MODEL_URL, {signal:abort.signal});
      if(!response.ok||!response.body) throw Error('stažení');
      let last = 0;
      const got = await storage.write(response, loaded=>{
        const progress = Math.min(1, loaded/bytes);
        if(progress-last>=0.01||progress===1){last=progress; set({progress, message:`Stahuji Ministral 3B, ${Math.round(progress*100)} % z 2,2 GB.`}, false);}
      }, abort.signal);
      if(got!==bytes){
        await storage.remove().catch(()=>{});
        set({downloading:false, installed:false, progress:0, message:'Stažený soubor nemá správnou velikost. Model jsem nespustil.'});
        return;
      }
      set({downloading:false, installed:true, progress:1, message:'Ministral 3B je v prohlížeči. Firemní údaje dál bere ze serveru a zápis čeká na potvrzení. První odpověď může trvat minutu.'});
    }catch(error){
      if(error?.name==='AbortError') return;
      await storage.remove().catch(()=>{});
      set({downloading:false, installed:false, progress:0, message:'Stahování selhalo. Zkuste to znovu na Wi-Fi. Model se nespustil.'});
    }finally{abort=null;}
  }
  function cancel(){
    abort?.abort();
    abort = null;
    storage.remove().catch(()=>{});
    set({downloading:false, installed:false, progress:0, message:'Stahování je zrušené. Model se nespustil.'});
  }
  async function remove(){
    cancel();
    await running?.exit?.().catch(()=>{});
    running = null;
    await storage.remove().catch(()=>{});
    set({installed:false, downloading:false, progress:0, message:'Model je smazaný z prohlížeče.'});
  }
  async function answer(user){
    const refusal = blocked();
    if(refusal) throw Error(refusal);
    if(!await refresh()) throw Error('Model ještě není stažený. Klepněte na Stáhnout Ministral.');
    if(!running){
      const file = await storage.file();
      running = engine ? await engine(file) : await browserEngine(file);
    }
    return running.complete(String(user||'').trim());
  }
  return {snapshot:()=>snapshot, subscribe(listener){listeners.add(listener); return ()=>listeners.delete(listener);}, refresh, start, cancel, remove, answer};
}

async function browserEngine(file){
  let module, paths;
  try{
    module = await import(RUNTIME);
    paths = (await import(RUNTIME_WASM)).default;
  }catch{throw Error('Runtime modelu se nepodařilo stáhnout. Připojte se. Deník jsem se neptal.');}
  const loaded = await loadEngine(module.Wllama, paths, file, {});
  return loaded;
}
async function loadEngine(Wllama, paths, file, params){
  const wllama = new Wllama(paths, {suppressNativeLog:true, allowOffline:true});
  try{
    await wllama.loadModel([file], {n_ctx:1024, n_batch:512, n_threads:1, seed:42, ...params});
  }catch(error){
    await wllama.exit().catch(()=>{});
    if(params.n_gpu_layers===0) throw Error('Model se nepodařilo načíst. Nechte v zařízení volné aspoň 4 GB a zkuste to znovu.');
    return loadEngine(Wllama, paths, file, {n_gpu_layers:0});
  }
  return {exit:()=>wllama.exit(), async complete(user){
    const prompt = `[SYSTEM_PROMPT]${SYSTEM}[/SYSTEM_PROMPT][INST]${user}[/INST]`;
    const stop = new AbortController();
    let output = '';
    try{
      await wllama.createCompletion({prompt, max_tokens:160, temperature:0.2, seed:42, stop:['</s>','[INST]'], stream:true, abortSignal:stop.signal, onData(chunk){
        output += chunk?.choices?.[0]?.text||'';
        if(extractLocalCommand(output)) stop.abort();
      }});
    }catch(error){
      if(!extractLocalCommand(output)) throw error?.name==='AbortError' ? Error('Ministral odpověď nedokončil. Základní asistent zůstává k dispozici.') : error;
    }
    const clean = output.trim();
    if(!clean) throw Error('Ministral odpověď nedokončil. Základní asistent zůstává k dispozici.');
    return clean;
  }};
}

export function browserStorage(){
  const fileName = MODEL_FILE;
  async function root(){return navigator.storage.getDirectory();}
  return {
    async size(){try{const handle = await (await root()).getFileHandle(fileName); return (await handle.getFile()).size;}catch{return 0;}},
    async file(){return (await (await root()).getFileHandle(fileName)).getFile();},
    async remove(){await (await root()).removeEntry(fileName).catch(()=>{});},
    async write(response, onProgress, signal){
      const directory = await root();
      const handle = await directory.getFileHandle(fileName, {create:true});
      const writable = await handle.createWritable();
      const reader = response.body.getReader();
      let got = 0;
      try{
        while(true){
          if(signal?.aborted) throw Object.assign(Error('zrušeno'), {name:'AbortError'});
          const {done, value} = await reader.read();
          if(done) break;
          await writable.write(value);
          got += value.byteLength;
          onProgress(got);
        }
        await writable.close();
        return got;
      }catch(error){
        await writable.abort?.().catch(()=>{});
        await directory.removeEntry(fileName).catch(()=>{});
        throw error;
      }
    }
  };
}

let shared;
export function localMinistral(){
  if(!shared) shared = createLocalMinistral({storage:browserStorage()});
  return shared;
}
