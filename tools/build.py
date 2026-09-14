"""Deterministic, dependency-free XPI build. Never packages secrets or local caches."""
from pathlib import Path
import hashlib,json,subprocess,zipfile
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'addon/manifest.json').read_text())
for js in [ROOT/'addon/bootstrap.js',*sorted((ROOT/'addon/content').glob('*.js'))]:
    subprocess.run(['node','--check',str(js)],check=True)
out=ROOT/'dist';out.mkdir(exist_ok=True)
name=f'ai-zotero-{manifest["version"]}.xpi'
with zipfile.ZipFile(out/name,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for p in sorted((ROOT/'addon').rglob('*')):
        if not p.is_file():continue
        relative=p.relative_to(ROOT/'addon').as_posix()
        if p.suffix not in {'.js','.json','.css','.xhtml','.svg','.png'}:raise ValueError(f'Unexpected addon file: {relative}')
        info=zipfile.ZipInfo(relative,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
        archive.writestr(info,p.read_bytes())
with zipfile.ZipFile(out/name) as archive:
    assert archive.testzip() is None
    assert {'manifest.json','bootstrap.js','content/workspace.xhtml'}.issubset(archive.namelist())
digest=hashlib.sha256((out/name).read_bytes()).hexdigest()
(out/(name+'.sha256')).write_text(f'{digest}  {name}\n')
print(f'{out/name}\nSHA256 {digest}')
