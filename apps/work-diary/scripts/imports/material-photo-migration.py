"""Compile the owner-approved screenshot transcription into an additive D1 migration.
The source JSON and SQL are server-side files; neither is served as a web asset.
"""
import hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
data=json.loads((root/'imports/materials-2026-10-16.json').read_text())
quote=lambda value:"'"+str(value).replace("'","''")+"'"
ident=lambda kind,value:'photo-material-'+kind+'-'+hashlib.sha256(value.encode()).hexdigest()[:20]
now=1792144800000
statements=[]
for ordinal,category in enumerate(data['categories']):
 name=category['name']; cid=ident('category',name)
 category_ref='(SELECT id FROM material_categories WHERE trim(name)=trim('+quote(name)+') COLLATE NOCASE ORDER BY created_at,id LIMIT 1)'
 statements.append("INSERT OR IGNORE INTO material_categories(id,name,sort_order,active,version,created_at,updated_at,updated_by) SELECT "+','.join([quote(cid),quote(name),str(10+ordinal),'1','1',str(now),str(now),quote('owner-approved-photo-import')])+" WHERE NOT EXISTS(SELECT 1 FROM material_categories WHERE trim(name)=trim("+quote(name)+") COLLATE NOCASE);")
 for item in category['items']:
  iid=ident('item',name+'|'+item['name']+'|'+item['unit'])
  statements.append("INSERT OR IGNORE INTO material_items(id,category_id,name,sku,unit,price_minor,currency,active,version,created_at,updated_at,updated_by) SELECT "+','.join([quote(iid),category_ref,quote(item['name']),"''",quote(item['unit']),str(item['priceMinor']),quote(data['currency']),'1','1',str(now),str(now),quote('owner-approved-photo-import')])+" WHERE NOT EXISTS(SELECT 1 FROM material_items WHERE category_id="+category_ref+" AND trim(name)=trim("+quote(item['name'])+") COLLATE NOCASE AND trim(unit)=trim("+quote(item['unit'])+") COLLATE NOCASE);")
  statements.append("INSERT OR IGNORE INTO material_item_revisions(id,item_id,item_version,snapshot,created_at) SELECT id||':1',id,1,json_object('itemId',id,'itemVersion',1,'categoryId',category_id,'name',name,'sku',sku,'unit',unit,'priceMinor',price_minor,'currency',currency),created_at FROM material_items WHERE id="+quote(iid)+" AND version=1 AND updated_by='owner-approved-photo-import';")
(root/'drizzle/0025_material_photos_20261016.sql').write_text('-- Owner-authorized screenshot import. Preserve category memberships and existing records.\n'+'\n--> statement-breakpoint\n'.join(statements)+'\n')
print(json.dumps({'categories':len(data['categories']),'items':sum(len(c['items']) for c in data['categories']),'excluded':len(data['excludedByOwner'])}))
