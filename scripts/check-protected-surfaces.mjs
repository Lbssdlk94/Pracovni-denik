import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const baseline=JSON.parse(await readFile(new URL('../docs/design-audit/protected-baseline.json',import.meta.url),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
for(const [path,expected] of Object.entries(baseline.files))assert.equal(hash(await readFile(new URL('../'+path,import.meta.url))),expected,'Protected surface changed: '+path);
for(const fragment of baseline.fragments){const source=await readFile(new URL('../'+fragment.file,import.meta.url),'utf8'),start=source.indexOf(fragment.start),end=source.indexOf(fragment.end,start);assert.ok(start>=0&&end>start,fragment.file);assert.equal(hash(source.slice(start,end)),fragment.sha256,'Protected fragment changed: '+fragment.file+' '+fragment.start);}
console.log(`PASS ${Object.keys(baseline.files).length} protected files and ${baseline.fragments.length} shared fragments are unchanged from ${baseline.baseline}`);
