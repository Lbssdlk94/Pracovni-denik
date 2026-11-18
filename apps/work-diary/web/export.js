import {clamp,safeName} from './model.js?v=workspace-roles-v1';
export function loadImage(blob) {
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(blob),img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Fotografii nelze otevřít. Zkuste obrázek ve formátu JPEG nebo PNG.'));};
    img.src=url;
  });
}
const toBlob=(canvas,type='image/png',quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Obrázek se nepodařilo vytvořit.')),type,quality));
export async function preparePhoto(file) {
  if(file.size>40*1024*1024)throw new Error('Fotografie je příliš velká. Vyberte soubor menší než 40 MB.');
  const img=await loadImage(file),scale=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  return await toBlob(canvas,'image/jpeg',.82);
}
function wrap(ctx,text,maxWidth) {
  const lines=[];let line='';
  for(const word of text.split(/\s+/)) {
    if(ctx.measureText(word).width>maxWidth){if(line){lines.push(line);line='';}let part='';for(const char of word){if(ctx.measureText(part+char).width>maxWidth){lines.push(part);part=char;}else part+=char;}line=part;}
    else if(line&&ctx.measureText(line+' '+word).width>maxWidth){lines.push(line);line=word;}
    else line+=(line?' ':'')+word;
  }
  if(line)lines.push(line);return lines.length?lines:[''];
}
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
export async function annotatedPhoto(record) {
  const img=await loadImage(record.image),width=Math.min(2048,img.naturalWidth),height=Math.round(img.naturalHeight*width/img.naturalWidth),s=width/1000;
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  const font=n=>`${Math.round(n*s)}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
  ctx.font=`bold ${font(22)}`;const titleLines=wrap(ctx,record.name||'Závlahová šachta',width-64*s);
  ctx.font=font(15);const locationLines=record.location?wrap(ctx,record.location,width-64*s):[];
  const rows=record.markers.map((m,i)=>({m,i,lines:wrap(ctx,`${i+1}. ${m.zoneName}`,width-80*s)}));
  const noteLines=record.notes?wrap(ctx,record.notes,width-64*s):[];
  const footer=(75+titleLines.length*24+locationLines.length*22+rows.reduce((n,r)=>n+r.lines.length*24+12,0)+(noteLines.length?24+noteLines.length*22:0))*s;
  const logicalHeight=Math.ceil(height+footer),renderScale=Math.min(1,Math.sqrt(12000000/(width*logicalHeight)));
  canvas.width=Math.max(1,Math.floor(width*renderScale));canvas.height=Math.max(1,Math.floor(logicalHeight*renderScale));ctx.scale(renderScale,renderScale);
  ctx.fillStyle='#faf9f6';ctx.fillRect(0,0,width,logicalHeight);ctx.drawImage(img,0,0,width,height);
  record.markers.forEach((m,i)=>{
    const x=m.x*width,y=m.y*height;ctx.font=font(15);
    const lines=wrap(ctx,m.zoneName,Math.min(260*s,width*.4));
    const boxW=Math.min(width-12*s,Math.max(50*s,...lines.map(line=>ctx.measureText(line).width))+24*s),boxH=lines.length*20*s+18*s;
    const bx=clamp(m.labelX*width-boxW/2,4*s,width-boxW-4*s),by=clamp(m.labelY*height-boxH/2,4*s,Math.max(4*s,height-boxH-4*s));
    ctx.strokeStyle=m.color;ctx.lineWidth=2.5*s;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(bx+boxW/2,by+boxH/2);ctx.stroke();
    ctx.fillStyle='#fffef9';rounded(ctx,bx,by,boxW,boxH,6*s);ctx.fillStyle=m.color;ctx.fillRect(bx,by+6*s,3*s,boxH-12*s);
    ctx.fillStyle='#283d33';ctx.textBaseline='top';lines.forEach((line,k)=>ctx.fillText(line,bx+12*s,by+(9+k*20)*s));
    ctx.beginPath();ctx.arc(x,y,15*s,0,Math.PI*2);ctx.fillStyle=m.color;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2*s;ctx.stroke();
    ctx.fillStyle='#fff';ctx.font=`bold ${font(14)}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),x,y);ctx.textAlign='left';
  });
  let y=height+28*s;ctx.textBaseline='top';ctx.fillStyle='#283d33';ctx.font=`bold ${font(22)}`;
  titleLines.forEach(line=>{ctx.fillText(line,32*s,y);y+=26*s;});
  ctx.font=font(15);ctx.fillStyle='#6a756d';locationLines.forEach(line=>{ctx.fillText(line,32*s,y);y+=22*s;});
  y+=16*s;rows.forEach(({m,lines})=>{ctx.fillStyle=m.color;ctx.beginPath();ctx.arc(37*s,y+8*s,5*s,0,Math.PI*2);ctx.fill();ctx.fillStyle='#283d33';ctx.font=font(15);lines.forEach(line=>{ctx.fillText(line,52*s,y);y+=24*s;});y+=12*s;});
  if(noteLines.length){y+=10*s;ctx.font=font(15);ctx.fillStyle='#6a756d';noteLines.forEach(line=>{ctx.fillText(line,32*s,y);y+=22*s;});}
  ctx.font=font(11);ctx.fillStyle='#788078';ctx.fillText(`Závlahový deník · ${new Date(record.updatedAt).toLocaleDateString('cs-CZ')}`,32*s,logicalHeight-28*s);
  return {blob:await toBlob(canvas),filename:safeName(record.name)+'.png'};
}
export function download(blob,filename) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export const blobToDataURL=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
