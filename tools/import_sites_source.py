#!/usr/bin/env python3
"""Copy a clean source snapshot from the Sites checkout, without its Git history or runtime data.
Run from this GitHub checkout: python3 tools/import_sites_source.py --source /path/to/platform
"""
import argparse, hashlib, json, os, re, subprocess
from pathlib import Path

args=argparse.ArgumentParser();args.add_argument('--source',required=True);cfg=args.parse_args()
source=Path(cfg.source).resolve();dest=Path(__file__).resolve().parents[1]
if source==dest or source in dest.parents or dest in source.parents:raise SystemExit('Use separate source and destination checkouts.')

def git(*args):return subprocess.check_output(['git','-C',str(source),*args],text=True).strip()
if git('status','--porcelain'):raise SystemExit('Source checkout has uncommitted changes; finish or preserve them before export.')
commit=git('rev-parse','HEAD');paths=git('ls-files','-z').split('\0')
allowed={'apps','assets','db','docs','drizzle','packages','scripts'}
root_files={'README.md','.env.example','.gitignore','package.json','package-lock.json','drizzle.config.js'}
ledger=dest/'.github-source-files.json';previous=json.loads(ledger.read_text()).get('files',[]) if ledger.exists() else []
files=[];excluded=[]
for raw in paths:
 if not raw:continue
 path=Path(raw);parts=path.parts
 if parts[0] not in allowed and raw not in root_files:excluded.append(raw);continue
 if any(p in {'node_modules','dist','.qa','.build','.wrangler','backups','uploads'} for p in parts):excluded.append(raw);continue
 if '.openai' in parts or (path.name.startswith('.env') and path.name!='.env.example') or path.name.startswith('.dev.vars') or path.suffix.lower() in {'.sqlite','.sqlite3','.db','.pdf','.tar','.gz','.zip'} or path.name.startswith('mobile-preview-'):excluded.append(raw);continue
 src=source/path;target=dest/path;target.parent.mkdir(parents=True,exist_ok=True)
 if src.is_symlink():
  resolved=src.resolve()
  if source not in resolved.parents:raise SystemExit('External symlink excluded: '+raw)
  if target.is_symlink() or target.is_file():target.unlink()
  os.symlink(os.readlink(src),target)
 else:
  data=src.read_bytes()
  if path.name=='.env.example':data=re.sub(rb'(?m)^PUBLIC_APP_URL=.*$',b'PUBLIC_APP_URL=',data)
  if re.search(rb'(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{24,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)',data):raise SystemExit('Potential credential pattern in '+raw+'; review before export.')
  if target.is_symlink():target.unlink()
  target.write_bytes(data)
 files.append(raw)
for raw in previous:
 if raw not in files:
  target=dest/raw
  if target.is_file() or target.is_symlink():target.unlink()
# Hosting identities must be supplied per deployment, never copied from a running company.
for path,value in [('.openai/hosting.json',{'d1':'DB','r2':None}),('apps/work-diary/.openai/hosting.json',{'d1':'DB','r2':'BUCKET'})]:
 target=dest/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(value,indent=2)+'\n');files.append(path)
extra='''\n# Local dependencies, compiled output, runtime state and deployment identities\nnode_modules/\ndist/\n.wrangler/\n**/.dev.vars*\n**/.openai/installation.json\n*.sqlite\n*.sqlite3\n*.db\nbackups/\nuploads/\n.github-export-local.json\n'''
p=dest/'.gitignore';p.write_text(p.read_text()+extra)
ledger.write_text(json.dumps({'source_commit':commit,'files':sorted(set(files))},indent=2)+'\n')
(dest/'SOURCE-IMPORT.md').write_text('# Import zdrojového kódu\n\nImportovaná verze zdroje: `'+commit+'`.\n\nTento repozitář obsahuje aktuální zdrojový snapshot Pracovního deníku a Super Admina, včetně testů a databázových schémat. Provozní databáze, R2 soubory zákazníků, přístupové klíče, místní úložiště a historie interního Sites repozitáře nejsou součástí importu. Syntetické testovací příklady a schémata/defaulty aplikace jsou zachovány.\n\nManifesty hostingu neobsahují identifikátory živých instalací. Je potřeba je nastavit samostatně pro konkrétní hosting. Uložení na GitHub neprovádí nasazení do běžících firem.\n\n## Další aktualizace\n\nZe samostatného checkoutu tohoto GitHub repozitáře spusťte `python3 tools/import_sites_source.py --source /cesta/k/pracovni-denik-platform`, zkontrolujte diff, spusťte testy a změny commitněte/pushněte. Skript vyžaduje čistý zdrojový checkout, zachovává interní relativní symlinky a odmítá externí symlinky nebo nalezený vzor přístupového klíče. Samotné přidání vzdáleného repozitáře do nezfiltrované historie není náhradou tohoto exportu.\n\nAutomatická synchronizace, GitHub Actions ani automatické produkční nasazování nejsou tímto importem zapnuty.\n')
print(json.dumps({'source_commit':commit,'copied_files':len(files),'excluded_files':len(excluded),'source_history_copied':False,'runtime_data_copied':False}))
