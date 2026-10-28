import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 1024 * 1024;
export function publicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a,b,c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
export function normalizeUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Enter a valid public website address.');
  const raw = value.trim();
  const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.port ||
      !url.hostname.includes('.') || (isIP(url.hostname) && !publicIPv4(url.hostname))) {
    throw new Error('Use a public website with a standard HTTP or HTTPS address.');
  }
  url.hash = ''; return url;
}
// Resolve every redirect independently; pin the connection to the validated IP.
export async function readPublic(value, {resolve = lookup, deadline = Date.now() + 24000} = {}, hops = 0) {
  const url = normalizeUrl(String(value));
  if (hops > 4 || Date.now() >= deadline) throw new Error('The website took too long or redirected too many times.');
  const records = await Promise.race([
    resolve(url.hostname, {all:true, family:4}),
    new Promise((_,reject) => {const t=setTimeout(()=>reject(new Error('Website DNS timed out.')),4000);t.unref();})
  ]);
  if (!records.length || records.some(r=>!publicIPv4(r.address))) throw new Error('This website address cannot be checked.');
  const result = await new Promise((resolveResult,reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.get(url, {
      headers: {'User-Agent':'OwnersBehindIt-WebsiteCheck/1.0 (+https://ownersbehindit.com/check-your-website)', 'Accept':'text/html,text/plain,application/xml,application/json;q=0.8'},
      lookup: (_hostname, options, cb) => options.all ? cb(null,[{address:records[0].address,family:4}]) : cb(null,records[0].address,4)
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        res.resume(); resolveResult({redirect:new URL(res.headers.location,url).href}); return;
      }
      const chunks=[]; let bytes=0;
      res.on('data',chunk=> {bytes+=chunk.length; if(bytes>MAX_BYTES) res.destroy(new Error('The page is too large for this check.')); else chunks.push(chunk);});
      res.on('error',reject);
      res.on('end',()=>resolveResult({url:url.href,status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8'),bytes}));
    });
    const timer=setTimeout(()=>req.destroy(new Error('The website did not respond in time.')), Math.min(8000,deadline-Date.now()));
    req.on('close',()=>clearTimeout(timer)); req.on('error',reject);
  });
  return result.redirect ? readPublic(result.redirect,{resolve,deadline},hops+1) : result;
}
const decode = s => s.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const p=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return p<=0x10ffff?String.fromCodePoint(p):'';}).replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&nbsp;/gi,' ');
const plain = s => decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
export function attrs(tag) {
  const result={};
  for(const m of tag.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]??'');
  return result;
}
export function analyze(page, robots, sitemap) {
  const html=page.body;
  const visible=html.replace(/<!--[^]*?-->/g,'').replace(/<(script|style|noscript)\b[^>]*>[^]*?<\/\1>/gi,'');
  const tags=(html.match(/<meta\b[^>]*>/gi)||[]).map(attrs);
  const meta=name=>tags.find(x=>x.name?.toLowerCase()===name)?.content||'';
  const title=plain(html.match(/<title\b[^>]*>([^]*?)<\/title>/i)?.[1]||'');
  const headings=[...visible.matchAll(/<h1\b[^>]*>([^]*?)<\/h1>/gi)].map(m=>plain(m[1])).filter(Boolean);
  const paragraphs=[...visible.matchAll(/<p\b[^>]*>([^]*?)<\/p>/gi)].map(m=>plain(m[1])).filter(x=>x.length>45).slice(0,4);
  const links=(visible.match(/<a\b[^>]*>/gi)||[]).map(attrs).map(x=>x.href||'');
  const images=(visible.match(/<img\b[^>]*>/gi)||[]).map(attrs);
  const canon=(html.match(/<link\b[^>]*>/gi)||[]).map(attrs).find(x=>x.rel?.toLowerCase().split(/\s+/).includes('canonical'))?.href;
  const structured=[]; let invalidSchema=false;
  for(const m of html.matchAll(/<script\b([^>]*)>([^]*?)<\/script>/gi)) {
    if(attrs(m[1]).type?.toLowerCase()!=='application/ld+json')continue;
    try { const data=JSON.parse(m[2]); structured.push(...(Array.isArray(data)?data:[data])); } catch {invalidSchema=true;}
  }
  const nodes=structured.flatMap(x=>[x,...(Array.isArray(x?.['@graph'])?x['@graph']:[])]);
  const types=nodes.flatMap(x=>Array.isArray(x?.['@type'])?x['@type']:[x?.['@type']]).filter(x=>typeof x==='string').slice(0,20);
  const business=nodes.find(x=>x?.name && (x.address || x.telephone || x.areaServed));
  const xrobots=String(page.headers['x-robots-tag']||'');
  const blocked=/\b(noindex|none)\b/i.test([meta('robots'),meta('googlebot'),meta('bingbot'),xrobots].join(' '));
  const findings=[];
  const add=(group,label,status,evidence,next='')=>findings.push({group,label,status,evidence,next});
  add('Search foundation','Search indexing instructions',blocked?'attention':'found',blocked?'A noindex instruction was found.':'No noindex instruction found in the page metadata or response header.',blocked?'Review whether this page should be public in search.':'This allows indexing; it does not confirm Google or Bing has indexed the page.');
  add('Search foundation','Page title',title?'found':'attention',title||'No page title found.',title?'Does this title describe the actual business and location?':'Add a descriptive page title.');
  add('Search foundation','Search description',meta('description')?'found':'attention',meta('description')||'No meta description found.','Describe the service and the customer it helps. Search engines may choose a different snippet.');
  add('Search foundation','Preferred page address',canon?'found':'review',canon||'No canonical link found.','A canonical identifies a preferred URL; its absence alone does not prevent indexing.');
  add('Search foundation','Robots file',robots?.status===200?'review':'unknown',robots?.status===200?'robots.txt is available.':'Could not confirm a robots.txt file.','Crawler-specific rules need review. A missing file does not automatically block search.');
  add('Search foundation','Sitemap',sitemap?.status===200 && /<(?:\w+:)?(?:urlset|sitemapindex)\b/i.test(sitemap.body)?'found':'unknown',sitemap?.status===200 && /<(?:\w+:)?(?:urlset|sitemapindex)\b/i.test(sitemap.body)?'An XML sitemap was found.':'No XML sitemap confirmed at /sitemap.xml. It may be elsewhere.','Sitemaps help discovery but do not guarantee indexing.');
  add('Business clarity','Main business headline',headings.length?'review':'attention',headings.join(' | ').slice(0,900)||'No H1 headline found in the returned HTML.','Would a first-time visitor understand what you do from this wording?');
  add('Business clarity','Business description',paragraphs.length?'review':'unknown',paragraphs.join('\n\n').slice(0,1600)||'No substantial paragraph found in the returned HTML.','Check whether this explains your service, who it helps, and your service area. This is extracted wording, not an AI verdict.');
  add('Business clarity','Business data for search engines',business?'found':types.length?'review':'unknown',business?JSON.stringify({name:business.name,telephone:business.telephone,address:business.address,areaServed:business.areaServed}).slice(0,1000):types.length?'Structured data types: '+types.join(', '):'No JSON-LD business details detected. Other formats may exist.','Check the name, location and services for accuracy. Structured data does not guarantee a search feature.');
  if(invalidSchema)add('Search foundation','Structured data syntax','attention','At least one JSON-LD block could not be parsed.','Repair the malformed JSON.');
  add('Contact and trust','Tap-to-call link',links.some(x=>/^tel:/i.test(x))?'found':'review',links.filter(x=>/^tel:/i.test(x)).join(', ')||'No telephone link detected.','A link was detected, not a working-call test.');
  add('Contact and trust','Email or inquiry form',links.some(x=>/^mailto:/i.test(x))||/<form\b/i.test(visible)?'found':'review',links.some(x=>/^mailto:/i.test(x))||/<form\b/i.test(visible)?'An email link or form is present.':'No email link or form found on this page.','Forms are not submitted during this check. Booking or contact options may be on another page.');
  const ownerLinks=links.filter(x=>/about|our-story|our-team|meet-|who-we-are/i.test(x)).slice(0,5);
  add('Contact and trust','People behind the business','review',ownerLinks.length?'Possible owner or team pages: '+ownerLinks.join(', '):'No obvious owner or team page link detected.','This needs a human look: can visitors see who is responsible and why they care?');
  add('Technical basics','Secure connection',page.url.startsWith('https:')?'found':'attention',page.url.startsWith('https:')?'The checked page loaded over HTTPS.':'The checked page loaded over HTTP.','This checks the page connection, not every asset or the overall security of the site.');
  add('Technical basics','Mobile viewport',meta('viewport')?'found':'attention',meta('viewport')||'No viewport meta tag found.','A viewport tag is a mobile foundation. It does not prove the layout works on a phone.');
  const missing=images.filter(i=>!Object.hasOwn(i,'alt')).length;
  add('Technical basics','Image alternative text',missing?'attention':images.length?'found':'unknown',`${images.length} images found; ${missing} missing an alt attribute. Empty alt text can be appropriate for decorative images.`,'Check that meaningful photos have useful descriptions.');
  return {url:page.url,checkedAt:new Date().toISOString(),scope:'Homepage HTML and public discovery files. JavaScript is not executed. Search rankings, form delivery, business claims and full accessibility are not verified.',findings,businessPreview:{title,headings,description:meta('description')},counts:{found:findings.filter(x=>x.status==='found').length,attention:findings.filter(x=>x.status==='attention').length,review:findings.filter(x=>x.status==='review'||x.status==='unknown').length}};
}
export async function speedCheck(url, key='', send=fetch) {
  const endpoint=new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url',url);endpoint.searchParams.set('strategy','mobile');endpoint.searchParams.set('category','performance');
  if(key)endpoint.searchParams.set('key',key);
  const response=await send(endpoint,{signal:AbortSignal.timeout(45000)});
  if(!response.ok)return {available:false,message:'Mobile speed measurements are unavailable right now. No speed score has been assigned.'};
  const data=await response.json(), lab=data.lighthouseResult;
  if(!lab?.categories?.performance || !Number.isFinite(lab.categories.performance.score))return {available:false,message:'No mobile speed measurement was returned.'};
  return {available:true,score:Math.round(lab.categories.performance.score*100),testedUrl:lab.finalDisplayedUrl||lab.finalUrl,fetchedAt:lab.fetchTime,metrics:['largest-contentful-paint','cumulative-layout-shift','total-blocking-time'].map(id=>({label:lab.audits[id]?.title,value:lab.audits[id]?.displayValue})),message:'Google Lighthouse mobile lab measurement. A single simulated run, not a search ranking or real-user verdict.'};
}
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default async request => {
  if(request.method!=='POST')return json({error:'Use POST to check a website.'},405);
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin)return json({error:'Open the checker on this website.'},403);
  try {
    if(Number(request.headers.get('content-length'))>4096)return json({error:'Request is too large.'},413);
    const text=await request.text();if(text.length>4096)return json({error:'Request is too large.'},413);
    const data=JSON.parse(text),url=normalizeUrl(data.url);
    if(data.mode==='speed') {
      await readPublic(url);
      const key=typeof Netlify!=='undefined'?Netlify.env.get('PAGESPEED_API_KEY')||'':'';
      return json(await speedCheck(url.href,key).catch(()=>({available:false,message:'The speed measurement did not finish. You can try again.'})));
    }
    const deadline=Date.now()+26000;
    const page=await readPublic(url,{deadline});
    if(page.status<200||page.status>=300)throw new Error(`The website returned HTTP ${page.status}. No report was scored.`);
    if(!String(page.headers['content-type']).toLowerCase().includes('text/html'))throw new Error('Enter a website page, rather than a file or download.');
    const base=new URL(page.url).origin;
    const [robots,sitemap]=await Promise.all(['/robots.txt','/sitemap.xml'].map(path=>readPublic(base+path,{deadline}).catch(()=>null)));
    return json(analyze(page,robots,sitemap));
  } catch(error) {return json({error:error instanceof SyntaxError?'Enter a valid website address.':error.message||'This website could not be checked.'},400);}
};
export const config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:6}};
