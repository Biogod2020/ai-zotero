"""Optional Chromium smoke checks of the actual UI against fictional offline fixtures."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
checks=[]; errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda d:d.accept())
    page.set_content((root/'dist/ai-zotero-preview.html').read_text(),wait_until='load'); page.wait_for_selector('.card')
    assert page.locator('.nav button').filter(has_text='文献库').is_visible(); checks.append('Library renders real UI')
    page.screenshot(path=str(root/'dist/preview-light.png'),full_page=True)
    page.locator('#library-search').fill('细胞分割');page.wait_for_timeout(250)
    assert page.locator('.card').count()>0; checks.append('Chinese offline query returns results')
    assert page.evaluate('window.__AI_ZOTERO_DEMO__.studio.state.usage.calls')==0; checks.append('Local query causes zero API usage')
    page.get_by_role('button',name='语义检索',exact=True).click();page.evaluate('window.__AI_ZOTERO_DEMO__.studio.emit()');page.wait_for_timeout(500);assert 'BM25 + 向量融合' in page.locator('#library-results').inner_text();checks.append('Semantic mode survives status refresh');
    page.locator('.nav button').filter(has_text='文献雷达').click();assert '高度相近' in page.locator('#main-view').inner_text(); checks.append('Radar renders ranked similarity evidence')
    page.screenshot(path=str(root/'dist/preview-radar.png'),full_page=True)
    page.locator('.nav button').filter(has_text='整理中心').click();assert '重复' in page.locator('#main-view').inner_text();checks.append('Organization review renders')
    page.locator('.nav button').filter(has_text='设置').click()
    page.locator('#setting-model').fill('mock:vision-v1');page.locator('#toggle-assistant').click()
    assert page.locator('#setting-model').input_value()=='mock:vision-v1';checks.append('Hiding assistant preserves unsaved settings')
    page.locator('#setting-theme').select_option('dark');page.get_by_role('button',name='保存设置',exact=True).click()
    assert page.locator('html').get_attribute('data-theme')=='dark';checks.append('Settings save and dark theme applied')
    page.locator('#setting-allowAI').check();page.get_by_role('button',name='保存设置',exact=True).click()
    page.locator('#toggle-assistant').click();page.locator('#assistant-question').fill('解释这篇论文');page.locator('#assistant-send').click();page.wait_for_timeout(200)
    assert '离线界面演示' in page.locator('.conversation').inner_text();checks.append('Assistant request/references render')
    page.locator('.nav button').filter(has_text='文献库').click();page.locator('#library-search').fill('');page.wait_for_timeout(200)
    page.evaluate("window.__AI_ZOTERO_DEMO__.studio.index.upsert({id:'999',libraryID:1,title:'<img src=x onerror=window.HACKED=1>',abstract:'payload',tags:[],text:'',year:'2026',attachments:[]});window.__AI_ZOTERO_DEMO__.studio.emit();")
    page.wait_for_timeout(500)
    assert page.evaluate('window.HACKED') is None;assert page.locator('.card').filter(has_text='<img src=x').count()==1;checks.append('Untrusted title rendered as inert text')
    page.set_viewport_size({'width':980,'height':900});page.screenshot(path=str(root/'dist/preview-dark.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+2');checks.append('Responsive viewport avoids horizontal overflow')
    browser.close()
assert not errors,errors
report={'passed':len(checks),'checks':checks,'pageErrors':errors,'scope':'Chromium UI + fictional bridge; NOT a native Zotero test'}
(root/'dist/ui-test-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
