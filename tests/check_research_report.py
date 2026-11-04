"""Browser regression check. Run with a Python that has playwright installed.
Uses installed Google Chrome; REPORT_URL optionally checks a deployed copy.
"""
import csv
import io
import json
import math
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('REPORT_URL', (ROOT/'research/nous-model-eval.html').as_uri())
ARTIFACTS = Path(os.environ.get('QA_ARTIFACTS', '/tmp/fpd-redesign'))
ARTIFACTS.mkdir(parents=True, exist_ok=True)
AXE = Path('/tmp/fpd-redesign/axe.min.js')
checks = []
def check(name, condition):
    assert condition, name
    checks.append(name)
    print('PASS', name)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless=True)
    page = browser.new_page(viewport={'width':1440,'height':1080})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL)
    data = page.locator('#report-data').text_content()
    data = json.loads(data)
    ranked = sorted([m for m in data['models'] if m['ranked']],key=lambda m:-m['quality'])
    check('Twelve models retained; ten ranked on equal task coverage',len(data['models'])==12 and len(ranked)==10)
    for m in ranked:
        score = sum(x['score'] for x in m['items'].values())/len(m['items'])
        check('Score unchanged: '+m['name'],math.isclose(m['quality'],score))
    check('Rankings rendered without divider-row sorting bug', page.locator('#board tbody tr').count()==10)
    check('Default highest-score model selected', page.locator('#inspect-name').text_content()==ranked[0]['name'])
    page.locator('[data-sort=cost]').click()
    check('Cost sorts lowest first', min(ranked,key=lambda m:m['cost'])['name'] in page.locator('#board tbody tr').first.text_content())
    page.locator('[data-sort=cost]').click()
    check('Sort toggles highest first', max(ranked,key=lambda m:m['cost'])['name'] in page.locator('#board tbody tr').first.text_content())
    page.locator('#search').fill('openai')
    check('Search filters provider',page.locator('#board tbody tr').count()==sum(m['provider']=='openai' for m in ranked))
    page.locator('#search').fill('not-a-real-model')
    check('Empty search has explanatory state','No matching models' in page.locator('#board tbody').text_content())
    page.locator('#search').fill('')
    page.locator('#model-select').select_option('google/gemini-4-argon')
    check('Inspector selection links chart and table',page.locator('#inspect-name').text_content()=='gemini-4-argon' and page.locator('#scatter [aria-pressed=true]').count()==1 and 'gemini-4-argon' in page.locator('#board .selected').text_content())
    page.locator('#scatter .point').first.focus()
    page.keyboard.press('Enter')
    check('Keyboard can select scatter point',page.locator('#inspect-name').text_content()==ranked[0]['name'])
    page.locator('[data-axis=latency]').click()
    check('Axis toggle changes chart and disables irrelevant control', 'Average response time' in page.locator('#scatter').text_content() and page.locator('#log-scale').is_disabled())
    page.locator('[data-axis=cost]').click()
    page.locator('#log-scale').uncheck()
    check('Linear scale available','log scale' not in page.locator('#scatter').text_content())
    page.locator('#log-scale').check()
    # Geometry, not string presence: bar endpoint is exactly at zero for either sign.
    geometry=page.locator('.mqd-bar').evaluate_all("els=>els.map(e=>{const r=e.getBoundingClientRect(),t=e.parentElement.getBoundingClientRect();return{v:+e.dataset.value,left:r.left,right:r.right,zero:t.left+t.width/2}})")
    check('Diverging bars share centered zero; signs point correctly',all((g['v']<0 and abs(g['right']-g['zero'])<1) or (g['v']>=0 and abs(g['left']-g['zero'])<1) for g in geometry))
    before=page.locator('#mqd-chart').text_content()
    page.locator('#baseline').select_option('particle-ai/particle-1')
    check('Changing baseline recomputes MQD',before!=page.locator('#mqd-chart').text_content())
    page.locator('#baseline').select_option(max(ranked,key=lambda m:m['cost'])['id'])
    check('Most expensive baseline gives honest empty state','No models have' in page.locator('#mqd-chart').text_content())
    page.locator('#baseline').select_option(data['reference'])
    for m in ranked:
        option=page.locator(f'#pair-b option[value="{m["id"]}"]')
        check('Model available to pair comparison: '+m['name'],option.count()==1)
    page.get_by_text('Compare two models directly',exact=True).click()
    page.locator('#pair-a').select_option('anthropic/claude-haiku-5.5')
    page.locator('#pair-b').select_option('google/gemini-4-argon')
    check('Head-to-head comparison calculated','+0.07' in page.locator('#pair-results').text_content())
    page.locator('#heat .heat-cell').first.click()
    check('Evidence dialog opens with actual request and answer',page.locator('#evidence').is_visible() and 'Pool' in page.locator('#task-prompt').text_content() and len(page.locator('#task-answer').text_content())>100)
    page.keyboard.press('Escape')
    check('Escape closes dialog',not page.locator('#evidence').is_visible())
    page.locator('#example').click()
    check('Example task preserved',page.locator('#evidence-kind').text_content()=='EXAMPLE TASK')
    page.locator('#close-evidence').click()
    with page.expect_download() as result:
        page.locator('#download').click()
    rows=list(csv.reader(io.StringIO(Path(result.value.path()).read_text())))
    check('Download contains real ranked data',len(rows)==11 and rows[1][1]==ranked[0]['name'])
    page.locator('#partial-summary').click()
    check('Partial and unavailable results are explicit', 'mercury-3' in page.locator('#partial-list').text_content() and 'No usable answers' in page.locator('#partial-list').text_content())
    page.locator('#partial-summary').click()
    page.locator('[data-sort=quality]').click()
    page.locator('#model-select').select_option(ranked[0]['id'])
    for w,h in [(1440,1080),(1024,900),(768,1024),(390,844),(320,740)]:
        page.set_viewport_size({'width':w,'height':h})
        page.wait_for_timeout(200)
        check(str(w)+'px: page has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        # Dots have readable gaps; no model-name labels laid on top of each other.
        points=page.locator('#scatter .point .point-label').evaluate_all('els=>els.map(e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})')
        check(str(w)+'px: numbered chart labels do not collide',all(math.hypot(a['x']-b['x'],a['y']-b['y'])>20 for i,a in enumerate(points) for b in points[i+1:]))
        check(str(w)+'px: all chart text stays inside the SVG',page.locator('#scatter').evaluate("svg=>{const r=svg.getBoundingClientRect();return [...svg.querySelectorAll('text')].every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1&&b.top>=r.top-1&&b.bottom<=r.bottom+1})}"))
        if AXE.exists():
            page.add_script_tag(path=str(AXE))
            audit=page.evaluate("async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})")
            (ARTIFACTS/f'axe-{w}.json').write_text(json.dumps(audit['violations'],indent=2))
            check(str(w)+'px: accessibility scan has no violations',not audit['violations'])
        page.screenshot(path=str(ARTIFACTS/f'checked-{w}.png'),full_page=True)
    check('No browser JavaScript errors',not errors)
    browser.close()
print(f'\n{len(checks)} checks passed. Browser screenshots: {ARTIFACTS}')
