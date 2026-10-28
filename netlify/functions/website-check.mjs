// Owners Behind It: free website check.
// Reads public pages only. Every request is pinned to a validated public IP,
// redirects are re-validated, and each call stays well inside the function time limit.
// Modes: site (homepage, site files, email records, certificate, page list),
//        pages (up to 6 pages of the same site), links (status of up to 30 internal links),
//        speedkey (returns the referrer-restricted PageSpeed key, if one is set).
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { lookup, resolveMx, resolveTxt } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 2 * 1024 * 1024;
const UA = 'Mozilla/5.0 (compatible; OwnersBehindIt-WebsiteCheck/2.0; +https://ownersbehindit.com/check-your-website)';
const BUDGET = 8500;

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
const sameSite = (a, b) => a.replace(/^www\./,'') === b.replace(/^www\./,'');

async function resolvePublic(hostname, resolve, deadline) {
  const records = await Promise.race([
    resolve(hostname, {all:true, family:4}),
    new Promise((_,reject) => {const t=setTimeout(()=>reject(new Error('Website DNS timed out.')),Math.max(500,Math.min(3000,deadline-Date.now())));t.unref?.();})
  ]);
  if (!records.length || records.some(r=>!publicIPv4(r.address))) throw new Error('This website address cannot be checked.');
  return records[0].address;
}

// One request. follow=false returns redirects instead of following them. head=true stops after the headers.
export async function readPublic(value, {resolve = lookup, deadline = Date.now() + BUDGET, follow = true, head = false, chain = []} = {}, hops = 0) {
  const url = normalizeUrl(String(value));
  if (hops > 5 || Date.now() >= deadline) throw new Error('The website took too long or redirected too many times.');
  const address = await resolvePublic(url.hostname, resolve, deadline);
  const result = await new Promise((done, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.get(url, {
      headers: {'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5', 'Accept-Language': 'en-US,en;q=0.8'},
      lookup: (_h, options, cb) => options.all ? cb(null,[{address,family:4}]) : cb(null,address,4)
    }, res => {
      const redirect = [301,302,303,307,308].includes(res.statusCode) && res.headers.location;
      if (redirect && follow) { res.resume(); done({redirect:new URL(res.headers.location,url).href, status:res.statusCode}); return; }
      if (head || redirect) { res.destroy(); done({url:url.href,status:res.statusCode,headers:res.headers,body:'',bytes:0,location:redirect?new URL(res.headers.location,url).href:''}); return; }
      const chunks=[]; let bytes=0, truncated=false;
      res.on('data',chunk=>{bytes+=chunk.length; if(bytes>MAX_BYTES){truncated=true;res.destroy();} else chunks.push(chunk);});
      const finish=()=>done({url:url.href,status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8'),bytes,truncated});
      res.on('end',finish); res.on('close',finish); res.on('error',e=>truncated?finish():reject(e));
    });
    const timer=setTimeout(()=>req.destroy(new Error('The website did not respond in time.')), Math.max(300,deadline-Date.now()));
    req.on('close',()=>clearTimeout(timer)); req.on('error',reject);
  });
  if (result.redirect) { chain.push({from:url.href,to:result.redirect,status:result.status}); return readPublic(result.redirect,{resolve,deadline,follow,head,chain},hops+1); }
  result.chain = chain; return result;
}

// ---------- reading one page ----------
const decode = s => s.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const p=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return p>0&&p<=0x10ffff?String.fromCodePoint(p):'';}).replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&nbsp;/gi,' ').replace(/&([a-z]+);/gi,(m,n)=>NAMED[n.toLowerCase()]??m);
const NAMED={copy:'©',reg:'®',trade:'™',middot:'·',bull:'•',hellip:'…',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',mdash:'—',ndash:'–',laquo:'«',raquo:'»',eacute:'é',egrave:'è',aacute:'á',iacute:'í',oacute:'ó',uacute:'ú',ntilde:'ñ',uuml:'ü',ouml:'ö',auml:'ä',deg:'°',frac12:'½',times:'×',rarr:'→',larr:'←',zwj:'',shy:''};
const plain = s => decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
export function attrs(tag) {
  const result={};
  for(const m of tag.matchAll(/([^\s=<>/"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]??'');
  return result;
}
const digits = s => { const d=s.replace(/\D/g,''); return d.length===11&&d[0]==='1'?d.slice(1):d; };

const TRACKERS = [
  ['Meta (Facebook) pixel',/connect\.facebook\.net\/[^"']*fbevents|fbq\(\s*['"]init/i],
  ['Google Analytics',/googletagmanager\.com\/gtag\/js|google-analytics\.com\/(analytics|ga)\.js|gtag\(\s*['"]config/i],
  ['Google Tag Manager',/googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/],
  ['TikTok pixel',/analytics\.tiktok\.com/i],
  ['LinkedIn Insight tag',/snap\.licdn\.com|_linkedin_partner_id/i],
  ['Microsoft Clarity (session recording)',/clarity\.ms/i],
  ['Hotjar (session recording)',/static\.hotjar\.com|hotjar\.com\/c\//i],
  ['FullStory (session recording)',/fullstory\.com\/s\/fs\.js|edge\.fullstory\.com/i],
  ['Microsoft Advertising tag',/bat\.bing\.com/i],
  ['Pinterest tag',/s\.pinimg\.com\/ct\/core\.js/i],
  ['Chat widget (Intercom)',/widget\.intercom\.io/i],
  ['Chat widget (Drift)',/js\.driftt\.com/i],
  ['Chat widget (Tidio)',/code\.tidio\.co/i],
  ['Chat widget (tawk.to)',/embed\.tawk\.to/i],
  ['Chat widget (LiveChat)',/cdn\.livechatinc\.com/i],
  ['Chat widget (HubSpot)',/js\.hs-scripts\.com|js\.usemessages\.com/i],
  ['Chat widget (Podium)',/connect\.podium\.com/i],
  ['Chat widget (Birdeye)',/birdeye\.com\/embed/i],
  ['Chat widget (GoHighLevel / LeadConnector)',/widgets\.leadconnectorhq\.com|leadconnectorhq\.com\/loader/i],
  ['Chat widget (Facebook Messenger)',/connect\.facebook\.net\/[^"']*customerchat/i],
];
const PLATFORMS = [
  ['WordPress',/wp-content\/|wp-includes\//i],['Wix',/static\.wixstatic\.com|wix\.com\/(?:lpviral|website)|X-Wix-/i],
  ['Squarespace',/static1\.squarespace\.com|squarespace-cdn/i],['GoDaddy Website Builder',/img1\.wsimg\.com|godaddysites\.com/i],
  ['Shopify',/cdn\.shopify\.com/i],['Weebly',/weebly\.com|editmysite\.com/i],['Duda',/irp\.cdn-website\.com|dudaone/i],
  ['Webflow',/webflow\.(?:com|io)|data-wf-page/i],['SITE123',/site123\.(?:me|com)/i],['GoHighLevel',/leadconnectorhq\.com|msgsndr\.com/i],
  ['Framer',/framerusercontent\.com/i],['Carrd',/carrd\.co/i],['Google Sites',/sites\.google\.com/i],
];
const FREE_HOSTS = /\.(wixsite\.com|godaddysites\.com|square\.site|site123\.me|weebly\.com|wordpress\.com|webflow\.io|carrd\.co|business\.site|my\.canva\.site|framer\.website|mystrikingly\.com|netlify\.app|vercel\.app|github\.io)$/i;
const BUILDER_BANNER = /(built (?:my|this) (?:site|website) for free|create your (?:own )?(?:free )?website|made with (?:wix|site123|weebly|carrd)|powered by (?:wix|weebly|site123|godaddy website builder)|this site was designed with the[\s\S]{0,40}wix)/i;
const PROFILES = [
  ['Google profile',/(?:google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|g\.page\/|share\.google\/|business\.google\.com|g\.co\/kgs|search\.google\.com\/local)/i],
  ['Facebook',/facebook\.com\/(?!sharer|share\.php|dialog|tr\b|plugins)/i],['Instagram',/instagram\.com\//i],['LinkedIn',/linkedin\.com\/(?:company|in)\//i],
  ['YouTube',/youtube\.com\/(?:@|c\/|channel|user)/i],['TikTok',/tiktok\.com\/@/i],['X (Twitter)',/(?:twitter|x)\.com\/(?!intent|share)[A-Za-z0-9_]+/i],
  ['Yelp',/yelp\.com\/biz\//i],['Nextdoor',/nextdoor\.com\/(?:pages|page)\//i],['BBB',/bbb\.org\//i],['Angi',/angi\.com\/|angieslist\.com\//i],
  ['Houzz',/houzz\.com\/pro/i],['Thumbtack',/thumbtack\.com\//i],['Zillow',/zillow\.com\/profile/i],['The Knot',/theknot\.com\/marketplace/i],
];

export function analyzePage(page) {
  const html = page.body || '';
  const base = new URL(page.url);
  const noComments = html.replace(/<!--[\s\S]*?-->/g,'');
  const head = (noComments.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)||[,noComments.split(/<body\b/i)[0]])[1];
  const visible = noComments.replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
  const metas = (noComments.match(/<meta\b[^>]*>/gi)||[]).map(attrs);
  const metaAll = key => metas.filter(m=>(m.name||m.property||'').toLowerCase()===key).map(m=>m.content||'');
  const linksTags = (noComments.match(/<link\b[^>]*>/gi)||[]).map(attrs);
  const titles = [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map(m=>plain(m[1]));
  const h1s = [...visible.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>plain(m[1]));
  const paragraphs = [...visible.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>plain(m[1])).filter(x=>x.length>50);
  const text = plain(visible.replace(/<\/(p|div|li|h\d|section|br)>/gi,' '));
  const anchors = [...visible.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(m=>({...attrs('<a '+m[1]+'>'), _text:plain(m[2]), _img:/<img\b[^>]*alt\s*=\s*["'][^"']+/i.test(m[2]), _aria:/aria-label\s*=/.test(m[1])||/<svg[\s\S]*?<title>/i.test(m[2])}));
  const hrefs = anchors.map(a=>a.href||'');
  const internal = new Set(), external = new Set();
  for (const h of hrefs) {
    if (!h || /^(#|javascript:|mailto:|tel:|sms:|data:)/i.test(h)) continue;
    try { const u=new URL(h,base); u.hash=''; if(!/^https?:$/.test(u.protocol))continue; (sameSite(u.hostname,base.hostname)?internal:external).add(u.href); } catch {}
  }
  const images = (visible.match(/<img\b[^>]*>/gi)||[]).map(attrs);
  const inlineImageBytes = [...html.matchAll(/data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]{2000,})/g)].reduce((s,m)=>s+Math.round(m[1].length*0.75),0);
  const structured=[]; let schemaInvalid=false;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if ((attrs('<s '+m[1]+'>').type||'').toLowerCase()!=='application/ld+json') continue;
    try { const d=JSON.parse(m[2].trim()); structured.push(...(Array.isArray(d)?d:[d])); } catch { schemaInvalid=true; }
  }
  const nodes = structured.flatMap(x=>[x,...(Array.isArray(x?.['@graph'])?x['@graph']:[])]);
  const schemaTypes = [...new Set(nodes.flatMap(x=>Array.isArray(x?.['@type'])?x['@type']:[x?.['@type']]).filter(t=>typeof t==='string'))].slice(0,15);
  const bizNode = nodes.find(x=>x?.name && (x.address||x.telephone||x.areaServed||x.geo));
  const addr = bizNode?.address; const addrText = typeof addr==='string'?addr:addr?[addr.streetAddress,addr.addressLocality,addr.addressRegion,addr.postalCode].filter(Boolean).join(', '):'';
  const robotsMeta = [...metaAll('robots'),...metaAll('googlebot'),...metaAll('bingbot')].join(' ').toLowerCase();
  const xrobots = String(page.headers?.['x-robots-tag']||'').toLowerCase();
  const scripts = (html.match(/<script\b[^>]*src\s*=\s*["'][^"']+/gi)||[]).length;
  const forms = (visible.match(/<form\b[\s\S]*?<\/form>/gi)||[]).filter(f=>!/^<form\b[^>]*\shidden\b/i.test(f));
  let unlabeled = 0;
  for (const f of forms) {
    const ids = new Set([...f.matchAll(/<label\b[^>]*for\s*=\s*["']([^"']+)/gi)].map(m=>m[1]));
    for (const i of (f.match(/<(input|select|textarea)\b[^>]*>/gi)||[])) {
      const a=attrs(i); const t=(a.type||'text').toLowerCase();
      if (['hidden','submit','button','image','reset'].includes(t) || 'hidden' in a) continue;
      if (a['aria-label'] || a['aria-labelledby'] || a.title || (a.id && ids.has(a.id))) continue;
      unlabeled++;
    }
  }
  const telLinks = [...new Set(hrefs.filter(h=>/^tel:/i.test(h)).map(h=>digits(decodeURIComponent(h.slice(4)))).filter(d=>d.length>=10))];
  const phonesText = [...new Set((text.match(/(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g)||[]).map(digits))].slice(0,8);
  const years = [...text.matchAll(/(?:©|\(c\)|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map(m=>+m[1]).filter(y=>y>1995&&y<2100);
  const profiles = {};
  for (const h of hrefs) for (const [name,re] of PROFILES) if (re.test(h) && !profiles[name]) profiles[name]=h;
  const all = html;
  const trackers = TRACKERS.filter(([,re])=>re.test(all)).map(([n])=>n);
  const platform = (PLATFORMS.find(([,re])=>re.test(all))||[])[0] || (metaAll('generator')[0]||'').split(/\s/)[0] || '';
  const mixed = base.protocol==='https:' ? (noComments.match(/<(?:img|script|iframe|source|video|audio|link)\b[^>]*(?:src|href)\s*=\s*["']http:\/\/[^"']+/gi)||[]).filter(t=>!/<link\b/i.test(t)||/stylesheet/i.test(t)).length : 0;
  const ogUrl = metaAll('og:url')[0]||'';
  return {
    url: page.url, status: page.status, bytes: page.bytes||html.length, truncated: !!page.truncated,
    titles, descriptions: metaAll('description'), h1s,
    canonicals: linksTags.filter(l=>(l.rel||'').toLowerCase().split(/\s+/).includes('canonical')).map(l=>{try{return new URL(l.href,base).href}catch{return l.href||''}}),
    ogUrl: ogUrl?(()=>{try{return new URL(ogUrl,base).href}catch{return ogUrl}})():'',
    ogTitle: metaAll('og:title')[0]||'', ogImage: metaAll('og:image')[0]||'',
    noindex: /\b(noindex|none)\b/.test(robotsMeta+' '+xrobots),
    viewport: metaAll('viewport')[0]||'', lang: (noComments.match(/<html\b[^>]*\blang\s*=\s*["']?([a-z-]+)/i)||[])[1]||'',
    schemaTypes, schemaInvalid,
    business: bizNode ? {name:String(bizNode.name).slice(0,120), telephone:bizNode.telephone?String(bizNode.telephone):'', address:addrText.slice(0,200), sameAs:[].concat(bizNode.sameAs||[]).slice(0,10)} : null,
    images: {total: images.length, missingAlt: images.filter(i=>!('alt' in i)).length},
    firstImageLazy: (images[0]?.loading||'').toLowerCase()==='lazy',
    inlineImageBytes,
    telLinks, phonesText, mailto: [...new Set(hrefs.filter(h=>/^mailto:/i.test(h)).map(h=>h.slice(7).split('?')[0].toLowerCase()))],
    forms: forms.length, unlabeled,
    emptyLinks: anchors.filter(a=>a.href && !a._text && !a._img && !a._aria && !a['aria-label'] && !a.title).length,
    internal: [...internal].slice(0,200), externalCount: external.size,
    profiles, years, trackers, platform,
    freeBuilder: BUILDER_BANNER.test(text) || FREE_HOSTS.test(base.hostname),
    privacyLink: hrefs.some(h=>/privacy/i.test(h)) || /privacy (policy|notice)/i.test(anchors.map(a=>a._text).join(' ')),
    termsLink: hrefs.some(h=>/terms|conditions/i.test(h)) || /terms (of (use|service)|and conditions)|terms & conditions/i.test(anchors.map(a=>a._text).join(' ')),
    mixedContent: mixed, words: text ? text.split(' ').length : 0, scripts,
    paragraphs: paragraphs.slice(0,3).map(p=>p.slice(0,400)),
  };
}

// ---------- site files ----------
const AI_BOTS = ['GPTBot','OAI-SearchBot','ChatGPT-User','PerplexityBot','ClaudeBot','Claude-SearchBot','Google-Extended','Applebot-Extended','Bingbot','Googlebot'];
export function parseRobots(body) {
  const groups=[]; let cur=null, lastWasAgent=false; const sitemaps=[]; const signals=[];
  for (const raw of String(body||'').split(/\r?\n/)) {
    const line=raw.replace(/#.*/,'').trim(); if(!line)continue;
    const m=line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if(!m)continue;
    const k=m[1].toLowerCase(), v=m[2].trim();
    if(k==='user-agent'){ if(!cur||!lastWasAgent){cur={agents:[],rules:[]};groups.push(cur);} cur.agents.push(v.toLowerCase()); lastWasAgent=true; continue; }
    lastWasAgent=false;
    if(k==='sitemap'){sitemaps.push(v);continue;}
    if(k==='content-signal'){signals.push(v);continue;}
    if(cur&&(k==='disallow'||k==='allow'))cur.rules.push({type:k,path:v});
  }
  const blocksAll = agent => {
    const a=agent.toLowerCase();
    const g = groups.find(x=>x.agents.includes(a)) || groups.find(x=>x.agents.includes('*'));
    if(!g) return false;
    return g.rules.some(r=>r.type==='disallow'&&r.path==='/') && !g.rules.some(r=>r.type==='allow'&&(r.path==='/'||r.path==='/$'));
  };
  return {sitemaps, signals, blocked: AI_BOTS.filter(blocksAll), everyoneBlocked: blocksAll('*')};
}
export function sitemapUrls(body) {
  const locs=[...String(body||'').matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)].map(m=>decode(m[1]));
  return {isIndex: /<sitemapindex\b/i.test(body||''), isSitemap: /<(?:\w+:)?(?:urlset|sitemapindex)\b/i.test(body||''), locs};
}

async function emailRecords(host) {
  const domain = host.replace(/^www\./,'');
  const t = ms => new Promise((_,r)=>{const x=setTimeout(()=>r(new Error('timeout')),ms);x.unref?.();});
  const safe = p => Promise.race([p,t(3000)]).catch(e=>({error:e.code||e.message}));
  const [mx, txt, dmarc] = await Promise.all([safe(resolveMx(domain)), safe(resolveTxt(domain)), safe(resolveTxt('_dmarc.'+domain))]);
  const flat = r => Array.isArray(r) ? r.map(x=>x.join('')) : [];
  const spf = flat(txt).filter(x=>/^v=spf1/i.test(x));
  const dm = flat(dmarc).filter(x=>/^v=DMARC1/i.test(x));
  const policy = (dm[0]?.match(/;\s*p\s*=\s*(\w+)/i)||[])[1]||'';
  const mxHosts = Array.isArray(mx) ? mx.map(x=>x.exchange.toLowerCase()) : [];
  const provider = mxHosts.some(h=>/google|googlemail/.test(h))?'Google':mxHosts.some(h=>/outlook|protection\.outlook/.test(h))?'Microsoft':mxHosts.some(h=>/secureserver/.test(h))?'GoDaddy':mxHosts.some(h=>/zoho/.test(h))?'Zoho':mxHosts.length?'another provider':'';
  return {domain, hasMx: mxHosts.length>0, mxError: mx?.error||'', provider, spf: spf.length, spfRecord: spf[0]||'', dmarc: dm.length>0, dmarcPolicy: policy.toLowerCase(), lookupFailed: !!(txt?.error && dmarc?.error && mx?.error && !/ENODATA|ENOTFOUND/.test(txt.error))};
}

async function certificate(host, resolve, deadline) {
  const address = await resolvePublic(host, resolve, deadline);
  return new Promise(done => {
    const s = tls.connect({host:address, servername:host, port:443, rejectUnauthorized:false, timeout:Math.max(500,Math.min(3500,deadline-Date.now()))}, () => {
      const c = s.getPeerCertificate(); const ok = s.authorized; const err = s.authorizationError ? String(s.authorizationError) : '';
      s.end(); done({validTo: c?.valid_to ? new Date(c.valid_to).toISOString() : '', issuer: c?.issuer?.O || c?.issuer?.CN || '', trusted: ok, error: err});
    });
    s.on('timeout',()=>{s.destroy();done({error:'timeout'});}); s.on('error',e=>done({error:e.code||e.message}));
  });
}

function pickPages(homeUrl, home, sitemapLocs, limit = 24) {
  const host = new URL(homeUrl).hostname;
  const skip = /\.(pdf|jpe?g|png|gif|webp|svg|mp4|mov|zip|docx?|xlsx?|pptx?|vcf|ics|xml|txt|json)(\?|$)|\/(wp-admin|wp-login|cart|checkout|my-account|feed|tag|author|page\/\d+)(\/|$)|\/(category)\//i;
  const seen = new Set([homeUrl.replace(/\/$/,'')]); const out = [];
  const add = u => { try { const x=new URL(u); x.hash=''; if(!sameSite(x.hostname,host)||!/^https?:$/.test(x.protocol)||skip.test(x.pathname+x.search))return; const k=x.href.replace(/\/$/,''); if(seen.has(k))return; seen.add(k); out.push(x.href);} catch {} };
  home.internal.forEach(add);
  sitemapLocs.forEach(add);
  return out.slice(0, limit - 1);
}

async function checkSite(input, resolve = lookup) {
  const deadline = Date.now() + BUDGET;
  const chain = [];
  const page = await readPublic(input, {resolve, deadline, chain});
  if (page.status < 200 || page.status >= 400) throw new Error(`The website answered with an error (code ${page.status}), so no report was made.`);
  const type = String(page.headers['content-type']||'').toLowerCase();
  if (type && !type.includes('html')) throw new Error('That address is a file, not a web page. Enter the website’s home page.');
  const home = analyzePage(page);
  const final = new URL(page.url), host = final.hostname, bare = host.replace(/^www\./,'');
  const other = host.startsWith('www.') ? bare : 'www.'+host;
  const soft = p => p.catch(e=>({error:e.message||'failed'}));
  const [robots, sm1, plainHttp, alt, email, cert] = await Promise.all([
    soft(readPublic(final.origin+'/robots.txt',{resolve,deadline})),
    soft(readPublic(final.origin+'/sitemap.xml',{resolve,deadline})),
    soft(readPublic('http://'+host+'/',{resolve,deadline,follow:false,head:true})),
    soft(readPublic('https://'+other+'/',{resolve,deadline,head:true,chain:[]})),
    emailRecords(host).catch(()=>({lookupFailed:true})),
    final.protocol==='https:' ? soft(certificate(host,resolve,deadline)) : Promise.resolve({error:'not https'}),
  ]);
  const robotsOk = robots.status===200 && !/<html/i.test(robots.body||'');
  const rb = robotsOk ? parseRobots(robots.body) : {sitemaps:[],signals:[],blocked:[],everyoneBlocked:false};
  let sm = sm1.status===200 ? sitemapUrls(sm1.body) : {isSitemap:false,locs:[]};
  let sitemapAt = sm.isSitemap ? final.origin+'/sitemap.xml' : '';
  const listed = rb.sitemaps.find(s=>{try{return sameSite(new URL(s).hostname,host)}catch{return false}});
  if ((!sm.isSitemap || sm.isIndex) && Date.now() < deadline - 1500) {
    const next = !sm.isSitemap ? (listed || final.origin+'/sitemap_index.xml') : (sm.locs.find(l=>/page|post|main|pages/i.test(l)) || sm.locs[0]);
    if (next) { const r = await soft(readPublic(next,{resolve,deadline})); if (r.status===200) { const s=sitemapUrls(r.body); if (s.isSitemap) { if(!sitemapAt)sitemapAt=next; sm = s.isIndex ? {...s, locs: []} : {...s, isIndex: sm.isIndex}; } } }
  }
  const pageLocs = sm.locs.filter(l=>!/\.xml(\?|$)/i.test(l));
  return {
    checkedAt: new Date().toISOString(), input: String(input), url: page.url, host, chain,
    server: String(page.headers['server']||''), cloudflare: /cloudflare/i.test(String(page.headers['server']||'')) || !!page.headers['cf-ray'],
    https: final.protocol==='https:',
    httpRedirect: plainHttp.error ? {error:plainHttp.error} : {status:plainHttp.status, location:plainHttp.location||''},
    altHost: {host: other, ...(alt.error ? {error:alt.error} : {status:alt.status, finalUrl:alt.url})},
    robots: {found: robotsOk, ...rb},
    sitemap: {found: !!sitemapAt, at: sitemapAt, count: pageLocs.length, urls: pageLocs.slice(0,300), listedInRobots: !!listed},
    email, cert,
    home, pages: pickPages(page.url, home, pageLocs),
  };
}

async function checkPages(site, urls, resolve = lookup) {
  const deadline = Date.now() + BUDGET; const host = normalizeUrl(site).hostname;
  return Promise.all(urls.slice(0,6).map(async u => {
    try {
      const url = normalizeUrl(u); if (!sameSite(url.hostname, host)) return {url:u, error:'Not part of this website.'};
      const p = await readPublic(url.href,{resolve,deadline});
      if (!String(p.headers['content-type']||'').toLowerCase().includes('html')) return {url:u, finalUrl:p.url, status:p.status, notHtml:true};
      return {...analyzePage(p), requested: u};
    } catch (e) { return {url:u, error:e.message||'Could not load.'}; }
  }));
}

async function checkLinks(site, urls, resolve = lookup) {
  const deadline = Date.now() + BUDGET; const host = normalizeUrl(site).hostname;
  const list = urls.slice(0,30); const out = []; let i = 0;
  const worker = async () => { while (i < list.length) { const u = list[i++];
    try { const url=normalizeUrl(u); if(!sameSite(url.hostname,host)){out.push({url:u,skipped:true});continue;}
      const r = await readPublic(url.href,{resolve,deadline,head:true}); out.push({url:u,status:r.status,finalUrl:r.url}); }
    catch (e) { out.push({url:u,error:/too long|respond in time/.test(e.message)?'timeout':e.message}); } } };
  await Promise.all(Array.from({length:8},worker));
  return out;
}

const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default async request => {
  if(request.method!=='POST')return json({error:'Use POST to check a website.'},405);
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin)return json({error:'Open the checker on this website.'},403);
  try {
    if(Number(request.headers.get('content-length'))>16384)return json({error:'Request is too large.'},413);
    const text=await request.text(); if(text.length>16384)return json({error:'Request is too large.'},413);
    const data=JSON.parse(text);
    if(data.mode==='speedkey'){ const key=typeof Netlify!=='undefined'?Netlify.env.get('PAGESPEED_API_KEY')||'':''; return json({key}); }
    if(data.mode==='pages') { if(!Array.isArray(data.urls))throw new Error('No pages to check.'); return json({pages: await checkPages(data.site, data.urls.map(String))}); }
    if(data.mode==='links') { if(!Array.isArray(data.urls))throw new Error('No links to check.'); return json({links: await checkLinks(data.site, data.urls.map(String))}); }
    const report = await checkSite(normalizeUrl(data.url).href);
    // One line in the function log per check: which public website was checked and when. Nothing about the visitor.
    console.log(JSON.stringify({event:'website_check', site: report.host, pages: report.pages.length + 1, at: report.checkedAt}));
    return json(report);
  } catch(error) {
    const m = error instanceof SyntaxError ? 'Enter a valid website address.' : /ENOTFOUND|EAI_AGAIN/.test(error.code||error.message) ? 'That website address could not be found. Check the spelling and try again.' : /ECONNREFUSED|ECONNRESET|EPROTO|certificate|SSL/i.test(error.code||error.message) ? 'The website would not accept a secure connection from the checker.' : error.message||'This website could not be checked.';
    return json({error:m},400);
  }
};
export const config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:40}};
export const _test = {checkSite, checkPages, checkLinks, pickPages, emailRecords};
