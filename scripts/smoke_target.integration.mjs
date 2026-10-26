// Offline/local integration only; never claims public HTTPS acceptance.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {createServer as createTlsServer} from 'node:https';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveSmokeTarget,verifySameOrigin} from './smoke_target.mjs';
const {request}=process.env.MODULE_ROOT?createRequire(join(process.env.MODULE_ROOT,'package.json'))('playwright'):await import('playwright');
const seen=[];
const server=createServer(async(req,res)=>{
 try{
  seen.push([req.method,req.url]);const api=req.url.startsWith('/api/')||req.url==='/health'||req.url.startsWith('/docs');
  const body=[];for await(const chunk of req)body.push(chunk);
  const response=await fetch((api?(process.env.BACKEND_URL??'http://127.0.0.1:8011'):(process.env.FRONTEND_URL??'http://127.0.0.1:5174'))+req.url,{method:req.method,headers:{'Content-Type':'application/json'},...(req.method==='POST'?{body:Buffer.concat(body)}:{})});
  res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')??'application/octet-stream'});res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(502);res.end('Local upstream unavailable');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let context, tlsServer;const temp=await mkdtemp(join(tmpdir(),'leaper-smoke-local-tls-'));
try{
 const target=resolveSmokeTarget({SMOKE_MODE:'same-origin',FRONTEND_URL:`http://127.0.0.1:${server.address().port}`});
 context=await request.newContext(target.contextOptions);await verifySameOrigin(context,target);
 assert.ok(seen.some(([method,path])=>method==='POST'&&path==='/api/v1/designs/normal-editing'));
 if(process.env.RUN_BROWSER_SMOKE==='1'){
  const run=await promisify(execFile)(process.execPath,['docs/NAR_BROWSER_SMOKE.mjs'],{env:{...process.env,SMOKE_MODE:'same-origin',FRONTEND_URL:target.frontend},maxBuffer:4*1024*1024});
  console.log(run.stdout);
 }
 await context.dispose();
 execFileSync('/usr/bin/openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 tlsServer=createTlsServer({key:await readFile(join(temp,'key.pem')),cert:await readFile(join(temp,'cert.pem'))},(_,res)=>res.end('untrusted fixture'));
 await new Promise(r=>tlsServer.listen(0,'127.0.0.1',r));
 const tlsTarget=resolveSmokeTarget({SMOKE_MODE:'same-origin',FRONTEND_URL:`https://127.0.0.1:${tlsServer.address().port}`});
 context=await request.newContext(tlsTarget.contextOptions);
 await assert.rejects(()=>verifySameOrigin(context,tlsTarget),/certificate|self.signed|SSL/i);
 console.log('PASS LOCAL integration only: real frontend/assets + backend same-origin POST, no API interception; untrusted self-signed TLS rejected. No public domain/certificate/deployment tested.');
}finally{await context?.dispose();await new Promise(r=>server.close(r));if(tlsServer)await new Promise(r=>tlsServer.close(r));await rm(temp,{recursive:true,force:true});}
