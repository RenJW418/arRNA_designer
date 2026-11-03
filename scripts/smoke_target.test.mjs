import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolveSmokeTarget,configureApiRouting,verifySameOrigin} from './smoke_target.mjs';
test('public rejects absent, non-HTTPS, non-443 and placeholder hosts',()=>{
 for(const url of [undefined,'http://site.org','https://site.org:8008','https://example.org','https://review.invalid','https://localhost','https://127.0.0.1','https://site.org/path']) assert.throws(()=>resolveSmokeTarget({SMOKE_MODE:'public',FRONTEND_URL:url}));
});
test('public and same-origin do not intercept API requests',async()=>{
 for(const mode of ['public','same-origin']){
 const target=resolveSmokeTarget({SMOKE_MODE:mode,FRONTEND_URL:mode==='public'?'https://owner-confirmed.research.org':'http://127.0.0.1:5174',BACKEND_URL:'http://127.0.0.1:8011'});
 await configureApiRouting({route(){throw Error('API was bypassed');}},target);
 assert.equal(target.contextOptions.ignoreHTTPSErrors,false);
 }
});
test('local-forward routing is explicit and preserves API path',async()=>{
 const target=resolveSmokeTarget({SMOKE_MODE:'local-forward',FRONTEND_URL:'http://127.0.0.1:5174',BACKEND_URL:'http://127.0.0.1:8011'});
 let handler;await configureApiRouting({route:async(_,f)=>handler=f},target);
 let url;await handler({request:()=>({url:()=> 'http://127.0.0.1:5174/api/v1/openapi'}),fetch:async options=>{url=options.url;return {};},fulfill:async()=>{}});
 assert.equal(url,'http://127.0.0.1:8011/api/v1/openapi');
});
test('public accepts an explicitly supplied HTTPS443 root and ignores separate backend routing',()=>{
 const target=resolveSmokeTarget({SMOKE_MODE:'public',FRONTEND_URL:'https://owner-confirmed.research.org:443',BACKEND_URL:'http://127.0.0.1:8011'});
 assert.equal(target.frontend,'https://owner-confirmed.research.org');assert.equal(target.mode,'public');
});
test('public HTTP redirect to a different host is rejected before any sequence POST',async()=>{
 const target=resolveSmokeTarget({SMOKE_MODE:'public',FRONTEND_URL:'https://owner-confirmed.research.org'});
 let posts=0;
 await assert.rejects(()=>verifySameOrigin({get:async()=>({status:()=>301,headers:()=>({location:'https://other.research.org/'})}),post:async()=>{posts++;}},target),/Redirect must retain/);
 assert.equal(posts,0);
});
