import assert from 'node:assert/strict';
import {isIP} from 'node:net';
const isLocal = host => ['localhost','127.0.0.1','[::1]'].includes(host);
export function resolveSmokeTarget(env=process.env){
 const mode=env.SMOKE_MODE??'local-forward';
 assert.ok(['local-forward','same-origin','public'].includes(mode),'SMOKE_MODE must be local-forward, same-origin or public');
 assert.ok(mode!=='public'||env.FRONTEND_URL,'Public mode requires the owner-provided FRONTEND_URL');
 const url=new URL(env.FRONTEND_URL??'http://127.0.0.1:5174');
 assert.ok(!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/','Use a root URL without credentials, query or fragment');
 if(mode==='public'){
  assert.equal(url.protocol,'https:','Public verification requires HTTPS');
  assert.ok(!url.port||url.port==='443','Public verification requires port 443');
  assert.ok(!isLocal(url.hostname)&&!isIP(url.hostname)&&url.hostname.includes('.')&&!/(^|\.)(example|example\.com|example\.org|example\.net|invalid|test|localhost|local|internal)(\.|$)/i.test(url.hostname),'Use the owner-provided real public hostname, not a placeholder or local address');
 }else{
  assert.ok(isLocal(url.hostname),'Local modes accept loopback only; use public for a real public hostname');
  assert.ok(['http:','https:'].includes(url.protocol));
 }
 return {mode,frontend:url.origin,backend:env.BACKEND_URL??'http://127.0.0.1:8011',contextOptions:{ignoreHTTPSErrors:false}};
}
export async function configureApiRouting(page,target){
 if(target.mode!=='local-forward')return;
 await page.route('**/api/**',async route=>{const u=new URL(route.request().url());await route.fulfill({response:await route.fetch({url:new URL(u.pathname+u.search,target.backend).href})});});
}
export async function verifySameOrigin(request,target){
 if(target.mode==='local-forward')return;
 const base=target.frontend;
 if(target.mode==='public'){
  const response=await request.get(base.replace(/^https:/,'http:'),{maxRedirects:0});
  assert.ok([301,302,307,308].includes(response.status()),'HTTP80 must redirect to HTTPS443');
  assert.equal(new URL(response.headers().location,base).origin,base,'Redirect must retain the supplied HTTPS origin');
 }
 for(const path of ['/','/health','/api/v1/openapi','/docs','/downloads/leaper_api_example.py','/examples/normal-input.json','/examples/exon-input.json','/examples/refinement-input.json']){
  const response=await request.get(base+path);assert.equal(response.status(),200,`Same-origin ${path} must respond 200`);assert.equal(new URL(response.url()).origin,base,'Endpoint must remain on the same origin');
  if(path==='/health')assert.equal((await response.json()).status,'ok');
  if(path==='/api/v1/openapi')assert.ok((await response.json()).paths['/api/v1/designs/normal-editing']);
  if(path==='/docs')assert.match(await response.text(),/swagger/i);
  if(path.endsWith('.py'))assert.match(await response.text(),/def main\(/);
  if(path.endsWith('.json'))assert.ok(await response.json());
 }
 const input=await(await request.get(base+'/examples/normal-input.json')).json();
 const response=await request.post(base+'/api/v1/designs/normal-editing',{data:input});
 assert.equal(response.status(),200,'Real same-origin normal-design POST must succeed');assert.equal(new URL(response.url()).origin,base);assert.ok((await response.json()).candidates.length>0);
 console.log(`PASS ${target.mode==='public'?'PUBLIC HTTPS443':'LOCAL same-origin (not public TLS)'} preflight: redirect when public, health/OpenAPI/docs/downloads and real same-origin POST; input sequences omitted`);
}
