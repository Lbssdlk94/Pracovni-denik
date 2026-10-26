// Mouse gestures use pointer capture rather than browser-specific HTML drag/drop.
// Touch keeps native scrolling and the original mobile job controls.
export function bindPlannerPointer({root,getDrag,onDrop,describe,onEnd}){
 const controller=new AbortController(),signal=controller.signal;let gesture=null,pending=false,generation=0,frame=0,lastFrame=0,ghost=null,hover=null,suppressUntil=0;
 const desktop=()=>matchMedia('(min-width:1024px)').matches;
 const emitEnd=()=>onEnd?.();
 function clearVisual(){cancelAnimationFrame(frame);frame=0;lastFrame=0;ghost?.remove();ghost=null;hover?.classList.remove('planner-drop-hover');hover=null;gesture?.el?.classList.remove('planner-drag-source');gesture?.scroller.classList.remove('planner-panning');document.body.classList.remove('planner-pointer-active');}
 function release(g){try{if(g?.scroller.hasPointerCapture(g.id))g.scroller.releasePointerCapture(g.id);}catch{}}
 function cancel(){const wasBusy=!!gesture||pending;generation++;clearVisual();const old=gesture;gesture=null;pending=false;release(old);if(old?.moved)suppressUntil=performance.now()+500;if(wasBusy)emitEnd();}
 function hit(g){const el=document.elementFromPoint(g.x,g.y),target=el?.closest('[data-planner-drop]');return target&&root.contains(target)?target:null;}
 function showTarget(){const g=gesture;if(!g||g.kind!=='job'||!g.moved)return;const target=hit(g);if(hover!==target){hover?.classList.remove('planner-drop-hover');hover=target;hover?.classList.add('planner-drop-hover');}if(!ghost){ghost=document.createElement('div');ghost.className='planner-drag-preview';ghost.setAttribute('role','status');document.body.append(ghost);}const text=g.drag.job.title+'\n'+(target?describe(g.drag,target,{x:g.x,y:g.y}):'Přesuňte na den a čas v rozpisu.');if(ghost.textContent!==text)ghost.textContent=text;ghost.style.left=Math.max(8,Math.min(innerWidth-236,g.x+18))+'px';ghost.style.top=Math.max(8,Math.min(innerHeight-100,g.y+18))+'px';}
 function autoScroll(now){frame=0;const g=gesture;if(!g||g.kind!=='job'||!g.moved)return;if(!root.isConnected||!desktop()){cancel();return;}const s=g.scroller,rect=s.getBoundingClientRect(),dt=Math.min(32,lastFrame?now-lastFrame:16)/1000;lastFrame=now;const speed=(v,lo,hi)=>v<lo+40?-700*Math.min(1,Math.max(0,(lo+40-v)/40)):v>hi-40?700*Math.min(1,Math.max(0,(v-hi+40)/40)):0;
  // Sticky names/hours cover the left edge of the actual time grid.
  const inset=s.matches('.jobs-week-scroll')?70:170,left=rect.left+inset,right=Math.min(rect.right,innerWidth),top=Math.max(rect.top+44,0),bottom=Math.min(rect.bottom,innerHeight);
  if(g.x>=rect.left&&g.x<=right&&g.y>=Math.max(0,rect.top)&&g.y<=bottom){s.scrollLeft+=speed(g.x,left,right)*dt;s.scrollTop+=speed(g.y,top,bottom)*dt;if(g.y>innerHeight-35&&rect.bottom>innerHeight)window.scrollBy(0,400*dt);else if(g.y<90&&rect.top<80)window.scrollBy(0,-400*dt);}
  showTarget();frame=requestAnimationFrame(autoScroll);
 }
 root.addEventListener('dragstart',e=>{if(gesture)e.preventDefault();},{signal});
 root.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.pointerType!=='mouse'||!e.isPrimary||!desktop()||pending||gesture)return;const el=e.target instanceof Element?e.target:null,queue=el?.closest('[data-planner-queue]'),scroller=el?.closest('.jobs-timeline-scroll,.jobs-week-scroll')||(queue?root.querySelector('.jobs-timeline-scroll,.jobs-week-scroll'):null);if(!scroller||!root.contains(scroller))return;const rect=scroller.getBoundingClientRect();if(!queue&&(e.clientX>=rect.left+scroller.clientWidth||e.clientY>=rect.top+scroller.clientHeight))return;const jobEl=el.closest('[data-planner-drag]'),drag=jobEl?getDrag(jobEl,e):null;if(jobEl&&!drag)return;if(!drag&&el.closest('button,a,input,select,textarea,summary,label'))return;
  suppressUntil=0;gesture={id:e.pointerId,kind:drag?'job':'pan',drag,el:jobEl,scroller,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,left:scroller.scrollLeft,top:scroller.scrollTop,moved:false};if(drag){document.body.classList.add('planner-pointer-active');e.preventDefault();jobEl.focus({preventScroll:true});}
 },{signal});
 window.addEventListener('pointermove',e=>{
  const g=gesture;if(!g||g.id!==e.pointerId)return;if(!root.isConnected){cancel();return;}g.x=e.clientX;g.y=e.clientY;if(!g.moved&&Math.hypot(g.x-g.startX,g.y-g.startY)<6)return;if(!g.moved){g.moved=true;g.scroller.setPointerCapture(e.pointerId);document.body.classList.add('planner-pointer-active');if(g.kind==='job'){g.el.classList.add('planner-drag-source');frame=requestAnimationFrame(autoScroll);}else g.scroller.classList.add('planner-panning');}e.preventDefault();if(g.kind==='pan'){g.scroller.scrollLeft=g.left+g.startX-g.x;g.scroller.scrollTop=g.top+g.startY-g.y;}else showTarget();
 },{signal});
 window.addEventListener('pointerup',async e=>{
  const g=gesture;if(!g||g.id!==e.pointerId)return;g.x=e.clientX;g.y=e.clientY;const target=g.moved&&g.kind==='job'?hit(g):null;if(g.moved){e.preventDefault();suppressUntil=performance.now()+500;}clearVisual();gesture=null;release(g);if(!g.moved){requestAnimationFrame(emitEnd);return;}if(g.kind==='pan'||!target){emitEnd();return;}
  pending=true;const ticket=++generation,isCurrent=()=>ticket===generation&&root.isConnected;try{await onDrop(g.drag,target,{x:g.x,y:g.y},isCurrent);}finally{if(ticket===generation){pending=false;emitEnd();}}
 },{signal});
 root.addEventListener('pointercancel',cancel,{signal});root.addEventListener('lostpointercapture',e=>{if(gesture?.id===e.pointerId)cancel();},{signal});
 root.addEventListener('click',e=>{if(performance.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();suppressUntil=0;}},{capture:true,signal});
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&gesture){e.preventDefault();e.stopPropagation();cancel();}},{capture:true,signal});window.addEventListener('blur',cancel,{signal});window.addEventListener('resize',cancel,{signal});window.addEventListener('offline',cancel,{signal});document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')cancel();},{signal});
 return {busy:()=>!!gesture||pending,destroy:()=>{cancel();controller.abort();}};
}
