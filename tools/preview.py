"""Generate a self-contained, offline UI preview using the real UI and fictional fixtures."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Zotero · Offline Preview</title><style>'
html += (ROOT/'addon/content/studio.css').read_text()
html += '</style></head><body><div id="app"></div>'
for name in ['addon/content/core.js','demo/bridge.js','addon/content/ui.js']:
    html += '<script>' + (ROOT/name).read_text().replace('</script','<\\/script') + '</script>'
html += '</body></html>'
(ROOT/'dist').mkdir(exist_ok=True)
(ROOT/'dist/ai-zotero-preview.html').write_text(html)
print(ROOT/'dist/ai-zotero-preview.html')
