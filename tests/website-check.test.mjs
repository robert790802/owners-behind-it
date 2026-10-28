import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{normalizeUrl,publicIPv4,readPublic,analyzePage,parseRobots,sitemapUrls} from '../netlify/functions/website-check.mjs';
import {buildReport,readSpeed} from '../website-check-report.js';

const html=`<!doctype html><html lang="en"><head><title>Plumber | Palm Coast</title><meta name="viewport" content="width=device-width"><meta name='description' content='Local repairs &amp; installations'><link rel="canonical" href="https://example.com/"><meta property="og:url" content="https://example.com/"><meta property="og:image" content="/x.png">
<script type="application/ld+json">{"@type":"Plumber","name":"Example Plumbing","telephone":"386-555-0100","address":{"addressLocality":"Palm Coast"}}</script></head>
<body><h1>Plumbing repairs in Palm Coast</h1><p>We repair plumbing for homeowners in Palm Coast. Meet the family behind our business.</p>
<p>Call 386-555-0100 or (386) 555-0199 today.</p><a href="tel:3865550100">Call</a><a href="/about">About</a><a href="https://maps.app.goo.gl/abc">Reviews</a><a href="/privacy">Privacy</a>
<form><input name="email"></form><img src="a.jpg"><img src="b.jpg" alt=""><p>© 2021 Example Plumbing</p>
<script src="https://connect.facebook.net/en_US/fbevents.js"></script><form hidden><input name="x"></form></body></html>`;
const page={url:'https://example.com/',status:200,headers:{'content-type':'text/html'},body:html,bytes:html.length};

test('public URLs normalize; nonpublic targets are rejected',()=>{
 assert.equal(normalizeUrl('example.com').href,'https://example.com/');
 for(const url of ['http://127.0.0.1','http://10.1.2.3','http://169.254.169.254','http://[::1]','ftp://example.com','https://user:pass@example.com','https://example.com:8443','http://localhost'])assert.throws(()=>normalizeUrl(url));
});
test('DNS is checked before connecting',async()=>{
 for(const address of ['10.1.2.3','127.0.0.1','100.64.0.1','192.168.1.2','169.254.169.254']){
  assert.equal(publicIPv4(address),false);
  await assert.rejects(readPublic('https://example.com',{resolve:async()=>[{address,family:4}]}),/cannot be checked/);
 }
});
test('a page is read and counted, not guessed',()=>{
 const a=analyzePage(page);
 assert.deepEqual(a.titles,['Plumber | Palm Coast']);
 assert.deepEqual(a.descriptions,['Local repairs & installations']);
 assert.equal(a.canonicals.length,1);
 assert.deepEqual(a.telLinks,['3865550100']);
 assert.ok(a.phonesText.includes('3865550199'));
 assert.equal(a.forms,1); assert.equal(a.unlabeled,1);
 assert.equal(a.images.missingAlt,1);
 assert.deepEqual(a.trackers,['Meta (Facebook) pixel']);
 assert.ok(a.profiles['Google profile']);
 assert.deepEqual(a.years,[2021]);
 assert.equal(a.business.name,'Example Plumbing');
});
test('robots and sitemaps',()=>{
 const r=parseRobots('User-agent: GPTBot\nUser-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml');
 assert.deepEqual(r.blocked,['GPTBot','OAI-SearchBot']); assert.equal(r.everyoneBlocked,false); assert.equal(r.sitemaps.length,1);
 assert.equal(parseRobots('User-agent: *\nDisallow: /').everyoneBlocked,true);
 assert.deepEqual(sitemapUrls('<urlset><url><loc>https://example.com/a</loc></url></urlset>').locs,['https://example.com/a']);
});
test('the report speaks in findings, with the right status',()=>{
 const home=analyzePage(page);
 const site={url:page.url,host:'example.com',checkedAt:'2026-10-28T15:00:00Z',https:true,home,pages:[],cloudflare:false,
  robots:parseRobots('User-agent: OAI-SearchBot\nDisallow: /'),sitemap:{found:false,urls:[],count:0},httpRedirect:{status:301},altHost:{host:'www.example.com',status:200,finalUrl:'https://example.com/'},
  email:{domain:'example.com',hasMx:true,provider:'Google',spf:1,dmarc:false},cert:{validTo:'2027-01-01T00:00:00Z',trusted:true}};
 const r=buildReport({site,links:[{url:'https://example.com/old',status:404}],now:new Date('2026-10-28')});
 const all=r.groups.flatMap(g=>g.findings); const by=t=>all.find(f=>f.title.startsWith(t));
 assert.equal(by('Phone numbers that don’t dial').status,'fix');
 assert.equal(by('Different phone numbers').status,'look');
 assert.equal(by('AI assistants are told').status,'look');
 assert.equal(by('Email from @example.com may land in spam').status,'look');
 assert.equal(by('1 link inside your site leads nowhere').status,'fix');
 assert.equal(by('The site looks out of date').status,'look');
 assert.equal(by('Your Google profile is linked').status,'good');
 assert.ok(!all.some(f=>/score/i.test(f.title)));
 assert.ok(!JSON.stringify(r).includes('—'),'no em dashes in report text');
});
test('speed data is read without inventing numbers',()=>{
 assert.equal(readSpeed({}).available,false);
 const s=readSpeed({lighthouseResult:{audits:{'largest-contentful-paint':{numericValue:3100},'cumulative-layout-shift':{numericValue:.02},'total-blocking-time':{numericValue:120},'color-contrast':{score:0}}}});
 assert.equal(s.lab.lcpMs,3100); assert.equal(s.field,null); assert.equal(s.a11y.length,1);
});
test('handler guards',async()=>{
 const req=(body,headers={})=>new Request('https://ownersbehindit.com/.netlify/functions/website-check',{method:'POST',body,headers});
 assert.equal((await handler(new Request('https://ownersbehindit.com/.netlify/functions/website-check'))).status,405);
 assert.equal((await handler(req('{}',{origin:'https://other.example'}))).status,403);
 assert.equal((await handler(req('invalid'))).status,400);
 assert.equal((await handler(req(JSON.stringify({url:'http://127.0.0.1'})))).status,400);
 assert.equal((await handler(req(JSON.stringify({mode:'pages',site:'https://example.com',urls:['https://evil.example/x']})))).status,200);
});
test('photos without a size, mouse-only controls and unnamed labels are found',()=>{
 const a=analyzePage({url:'https://example.com/',status:200,headers:{},body:'<img src="/me.jpg" alt="Me"><img src="/s.png" alt="" width="10" height="10"><img src="https://www.facebook.com/tr?id=1" style="display:none"><span onclick="x()">×</span><button onclick="x()">ok</button><span class="yes" aria-label="Included"></span><span role="img" aria-label="Included"></span>'});
 assert.equal(a.images.unsized,1); assert.deepEqual(a.images.unsizedSrc,['me.jpg']);
 assert.equal(a.mouseOnly,1); assert.equal(a.namelessRole,1);
});
