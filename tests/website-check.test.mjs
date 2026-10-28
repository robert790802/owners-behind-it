import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{normalizeUrl,publicIPv4,readPublic,analyze,speedCheck} from '../netlify/functions/website-check.mjs';
const page={url:'https://example.com/',headers:{'content-type':'text/html'},body:`<!doctype html><title>Plumber | Palm Coast</title><meta content="width=device-width" name="viewport"><meta name='description' content='Local repairs &amp; installations'><h1>Plumbing repairs in Palm Coast</h1><p>We repair plumbing for homeowners in Palm Coast. Meet the family behind our business.</p><a href="tel:1234">Call</a><a href="/about">About</a><img src="photo.jpg"><img src="decoration.jpg" alt=""><script type="application/ld+json">{"@type":"Plumber","name":"Example Plumbing","telephone":"1234"}</script>`};
test('public URLs normalize; nonpublic targets and unexpected schemes are rejected',()=>{
 assert.equal(normalizeUrl('example.com').href,'https://example.com/');
 for(const url of ['http://127.0.0.1','http://2130706433','http://0x7f000001','http://10.1.2.3','http://169.254.169.254','http://[::1]','ftp://example.com','https://user:pass@example.com','https://example.com:8443','http://localhost'])assert.throws(()=>normalizeUrl(url));
});
test('DNS resolution is checked before opening connections',async()=>{
 for(const address of ['10.1.2.3','127.0.0.1','100.64.0.1','192.168.1.2','198.18.0.1','169.254.169.254','::1']) {
  assert.equal(publicIPv4(address),false);
  await assert.rejects(readPublic('https://example.com',{resolve:async()=>[{address,family:4}]}),/cannot be checked/);
 }
 await assert.rejects(readPublic('https://example.com',{resolve:async()=>[{address:'8.8.8.8'},{address:'10.0.0.1'}]}));
 assert.equal(publicIPv4('8.8.8.8'),true);
});
test('returns evidence without inventing indexing or clarity verdicts',()=>{
 const report=analyze(page,{status:200,body:'User-agent: *\nDisallow: /'},{status:404,body:'not found'});
 assert.equal(report.businessPreview.title,'Plumber | Palm Coast');
 assert.equal(report.businessPreview.description,'Local repairs & installations');
 const find=label=>report.findings.find(f=>f.label===label);
 assert.equal(find('Robots file').status,'review');
 assert.equal(find('Sitemap').status,'unknown');
 assert.equal(find('Main business headline').status,'review');
 assert.equal(find('Business data for search engines').status,'found');
 assert.equal(find('Image alternative text').status,'attention');
 assert.match(find('Image alternative text').evidence,/2 images found; 1 missing/);
 assert.equal(find('Tap-to-call link').status,'found');
 assert.equal(find('Search indexing instructions').status,'found');
 assert.match(find('Search indexing instructions').next,/does not confirm/);
});
test('noindex in HTTP headers and bot-specific tags is reported',()=>{
 for(const variant of [{...page,headers:{'x-robots-tag':'noindex'}},{...page,body:page.body+'<meta name="bingbot" content="noindex">'}])assert.equal(analyze(variant,null,null).findings[0].status,'attention');
});
test('valid sitemap, graph schema, malformed JSON, and script-only pages stay distinct',()=>{
 const report=analyze({...page,body:'<script type="application/ld+json">invalid</script><script>document.write("<h1>fake headline</h1>")</script>'},null,{status:200,body:'<?xml version="1.0"?><urlset></urlset>'});
 assert.equal(report.findings.find(f=>f.label==='Sitemap').status,'found');
 assert.equal(report.findings.find(f=>f.label==='Structured data syntax').status,'attention');
 assert.deepEqual(report.businessPreview.headings,[]);
 const graph=analyze({...page,body:'<script type="application/ld+json">{"@graph":[{"@type":"LocalBusiness","name":"Example","address":"Palm Coast"}]}</script>'},null,null);
 assert.equal(graph.findings.find(f=>f.label==='Business data for search engines').status,'found');
});
test('speed API failures produce no fabricated score',async()=>{
 assert.deepEqual(await speedCheck('https://example.com','',async()=>({ok:false})),{available:false,message:'Mobile speed measurements are unavailable right now. No speed score has been assigned.'});
 const report=await speedCheck('https://example.com','test',async url=>{assert.equal(url.searchParams.get('strategy'),'mobile');return {ok:true,json:async()=>({lighthouseResult:{categories:{performance:{score:0.73}},audits:{}}})};});
 assert.equal(report.score,73);
});
test('handler rejects methods, cross-origin requests, invalid JSON and local addresses',async()=>{
 assert.equal((await handler(new Request('https://ownersbehindit.com/.netlify/functions/website-check'))).status,405);
 const request=(body,headers={})=>new Request('https://ownersbehindit.com/.netlify/functions/website-check',{method:'POST',body,headers});
 assert.equal((await handler(request('{}',{origin:'https://other.example'}))).status,403);
 assert.equal((await handler(request('invalid'))).status,400);
 assert.equal((await handler(request(JSON.stringify({url:'http://127.0.0.1'})))).status,400);
 assert.equal((await handler(request('a'.repeat(5000)))).status,413);
});
