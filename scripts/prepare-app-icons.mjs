// One vector master for the home-screen, browser, notification and in-app identity.
// The original supplied blue icon remains archived in assets/app-icon/source.png.
import sharp from 'sharp';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const source=await readFile(path.join(root,'assets/app-icon/approved-mark.svg'));
const destinations=[path.join(root,'apps/work-diary/web'),path.join(root,'apps/super-admin/web')];
await sharp(source,{density:144}).resize(1024,1024).flatten({background:'#FFFFFF'}).png().toFile(path.join(root,'assets/app-icon/approved-master.png'));
for(const dest of destinations){
 await mkdir(dest,{recursive:true});await writeFile(path.join(dest,'work-diary-mark.svg'),source);
 for(const size of [32,48,180,192,512,1024])await sharp(source,{density:144}).resize(size,size).flatten({background:'#FFFFFF'}).png({compressionLevel:9}).toFile(path.join(dest,`work-diary-icon-${size}.png`));
 // The glyph already lies inside Android's central 80% safe circle. Keep the
 // background opaque and square; the operating system applies the final mask.
 for(const size of [192,512])await sharp(source,{density:144}).resize(size,size).flatten({background:'#FFFFFF'}).png({compressionLevel:9}).toFile(path.join(dest,`work-diary-icon-maskable-${size}.png`));
}
console.log('Prepared approved green/white icon, in-app SVG, opaque 32/48/180/192/512/1024 PNG and Android maskable variants.');
