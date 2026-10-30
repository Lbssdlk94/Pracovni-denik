// One bounded reconnect loop; no reload, cache reset or replay of arbitrary writes.
// Outbox replay remains in cloud.js with its existing stable operation IDs.
export function createConnectionRecovery({run,available=()=>true,setTimer=setTimeout,clearTimer=clearTimeout,random=Math.random}){
 let timer=null,flight=null,failures=0,stopped=true;
 const schedule=delay=>{if(stopped||timer!==null)return;timer=setTimer(()=>{timer=null;tick();},delay);};
 const delay=()=>Math.min(60000,3000*2**Math.min(failures,4))+Math.round(random()*500);
 async function tick(){
  if(stopped)return;
  if(!available()){schedule(5000);return;}
  if(flight)return flight;
  const task=(async()=>{let ok=false;try{ok=await Promise.resolve().then(run)!==false;}catch{}finally{failures=ok?0:failures+1;flight=null;schedule(ok?20000:delay());}})();flight=task;return task;
 }
 return {
  start(){stopped=false;schedule(20000);},
  stop(){stopped=true;if(timer!==null)clearTimer(timer);timer=null;},
  retryNow(){if(stopped)return;if(timer!==null)clearTimer(timer);timer=null;return tick();},
  failed(){if(stopped||flight)return;if(timer!==null)clearTimer(timer);timer=null;schedule(delay());}
 };
}
