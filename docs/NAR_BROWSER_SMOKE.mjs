import {resolveSmokeTarget,configureApiRouting,verifySameOrigin} from '../scripts/smoke_target.mjs';
// Real Chrome/Chromium + WebKit user-flow smoke. Only API forwarding for local ports; design API is real.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile} from 'node:fs/promises';
const {chromium,webkit}=process.env.MODULE_ROOT ? createRequire(process.env.MODULE_ROOT+'/package.json')('playwright') : await import('playwright');
const target=resolveSmokeTarget();const frontend=target.frontend;
const out=process.env.SCREENSHOT_DIR ?? '/tmp/leaper-nar-crossbrowser';await mkdir(out,{recursive:true});
for(const [name,engine,options] of [['chrome',chromium,process.env.CHROME_EXECUTABLE ? {executablePath:process.env.CHROME_EXECUTABLE} : {}],['webkit',webkit,{}]]){
 let browser;
 try {
  browser=await engine.launch({headless:true,...options});const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true,...target.contextOptions});page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('leaper-language','en'));
  await configureApiRouting(page,target);await verifySameOrigin(page.request,target);
  await page.goto(frontend);
  assert.equal(await page.getByRole('link',{name:'Download Python API template',exact:true}).getAttribute('href'),'/downloads/leaper_api_example.py');
  await page.getByRole('button',{name:'API',exact:true}).click();
  await page.getByRole('heading',{name:'API access and working Python template',exact:true}).waitFor();
  await page.locator('.guide-contents').getByRole('button',{name:'Normal editing',exact:true}).click();
  assert.equal(await page.locator('#normal-guide').count(),1);
  const download=page.waitForEvent('download');await page.getByRole('link',{name:'Download Python API template',exact:true}).click();
  assert.match(await readFile(await (await download).path(),'utf8'),/def main\(\)/);
  assert.equal(await page.locator('.api-guide tbody tr').count(),6);
  await page.getByRole('button',{name:'简中',exact:true}).click();
  await page.getByRole('heading',{name:'API 使用与可运行 Python 模板',exact:true}).waitFor();
  await page.getByRole('button',{name:'EN',exact:true}).click();
  await page.screenshot({path:out+'/'+name+'-help-api.png',fullPage:true});
  await page.locator('.tutorial-example-grid article').nth(0).getByRole('button',{name:'Load example',exact:true}).click();
  await page.getByRole('button',{name:'Generate arRNA candidates',exact:true}).click();
  await page.locator('.result-primary-export code').waitFor();assert.equal((await page.locator('.result-primary-export code').innerText()).length,113);
  await page.screenshot({path:out+'/'+name+'-normal.png',fullPage:true});
  await page.getByRole('button',{name:'Help',exact:true}).click();
  await page.locator('.tutorial-example-grid article').nth(1).getByRole('button',{name:'Load example',exact:true}).click();
  await page.getByRole('button',{name:'Generate exon-skipping arRNAs',exact:true}).click();
  await page.getByRole('heading',{name:/Exon skipping ·/}).waitFor();
  assert.equal(await page.locator('.exon-candidate-sidebar .task-candidate').count(),2);
  await page.getByRole('button',{name:'Help',exact:true}).click();
  await page.locator('.tutorial-example-grid article').nth(2).getByRole('button',{name:'Load example',exact:true}).click();
  await page.getByRole('button',{name:'Review inferred alignment',exact:true}).click();
  assert.equal(await page.locator('.tested-alignment-summary div').filter({hasText:'Starting structures'}).locator('dd').innerText(),'0');
  await page.getByRole('button',{name:'Confirm and enter experimental results',exact:true}).click();
  const targetEfficiency=page.locator('#target-a0-efficiency');assert.equal(await targetEfficiency.inputValue(),'');await targetEfficiency.fill('42');
  assert.equal(await page.getByLabel('Optional bystander A86 editing efficiency (%)',{exact:true}).inputValue(),'');
  await page.getByRole('button',{name:'Try manual design',exact:true}).click();
  await page.getByRole('button',{name:'Use this bulge in manual design',exact:true}).first().click();
  const jsonPromise=page.waitForEvent('download');await page.getByRole('button',{name:'JSON with tested baseline',exact:true}).click();
  const record=JSON.parse(await readFile(await (await jsonPromise).path(),'utf8'));assert.equal(record.evidence.tested_baseline.arrna_sequence.length,151);assert.equal(record.evidence.observed_editing_efficiencies[76],42);assert.equal(record.evidence.observed_editing_status[86],'unmeasured');
  await page.screenshot({path:out+'/'+name+'-refinement.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS '+target.mode+' '+name+' '+browser.version()+': homepage template, bilingual comprehensive help/API, actual Python download, all 3 ready examples through real API, refinement unknown status/JSON');
 }catch(e){console.error('FAIL '+target.mode+' '+name,target.mode==='public'?'Details omitted to avoid logging input sequences':e);process.exitCode=1;}
 finally{await browser?.close();}
}
