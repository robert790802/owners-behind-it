// Browser-independent orchestration of the existing checker, not a replacement audit.
import {normalizeUrl, _test} from '../netlify/functions/website-check.mjs';
import {buildReport, readSpeed} from '../website-check-report.js';

export const REPORT_VERSION = 'obi-website-check/2026-10-31.1';
const safeMessage = error => /timeout|timed out|abort/i.test(String(error?.message || error)) ? 'The check timed out.' : 'This check could not finish.';
const canonical = value => normalizeUrl(value).href.replace(/\/$/, '');
const sameHost = (a,b) => new URL(a).hostname.replace(/^www\./,'') === new URL(b).hostname.replace(/^www\./,'');

export async function mobileSpeed(url, {fetchImpl = fetch, apiKey = '', timeoutMs = 45000} = {}) {
  // The URL is already checked by checkSite; Google receives public website data only.
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  api.searchParams.set('url', normalizeUrl(url).href);
  api.searchParams.set('strategy', 'mobile');
  api.searchParams.append('category', 'performance');
  api.searchParams.append('category', 'accessibility');
  // Never retrieve the browser's referrer-restricted key or forge its referrer.
  if (apiKey) api.searchParams.set('key', apiKey);
  try {
    const response = await fetchImpl(api, {signal: AbortSignal.timeout(timeoutMs), redirect: 'error'});
    if (!response.ok) return {available:false, code:response.status===429?'quota_exhausted':'provider_error', message:response.status===429?'Google mobile speed was unavailable because its API quota was exhausted. This is not a website failure.':'Google mobile speed was unavailable (HTTP '+response.status+').', http_status:response.status};
    const data=await response.json();
    const audits=data?.lighthouseResult?.audits;
    if(data?.lighthouseResult?.runtimeError||!['largest-contentful-paint','cumulative-layout-shift','total-blocking-time'].every(id=>Number.isFinite(audits?.[id]?.numericValue)&&audits[id].numericValue>=0)||!(audits['largest-contentful-paint'].numericValue>0))return {available:false,code:'no_measurement',message:'Google returned no complete mobile measurement.'};
    const result = readSpeed(data);
    return {...result, code:result.available?'completed':'no_measurement'};
  } catch (error) { return {available:false, code:'request_failed', message:safeMessage(error)}; }
}

export async function runWebsiteCheck(input, options = {}) {
  const url = normalizeUrl(input).href;
  const {checkSite = _test.checkSite, checkPages = _test.checkPages, checkLinks = _test.checkLinks, speed = mobileSpeed, now = () => new Date(), apiKey = ''} = options;
  const started_at = now().toISOString();
  const phases = [];
  let site;
  try {site = await checkSite(url);} catch(error) {
    return {schema_version:1, engine:REPORT_VERSION, requested_url:url, checked_at:now().toISOString(), started_at, status:'unavailable', phases:[{id:'site',status:'unavailable',note:safeMessage(error)}], report:null};
  }
  // Do not call any external provider until the existing safe fetch has succeeded.
  normalizeUrl(site.url);
  const siteGaps=[];
  if(site.robots?.error)siteGaps.push('Robots file could not be checked.');
  if(site.sitemap?.error)siteGaps.push('Sitemap could not be checked.');
  if(site.home?.truncated)siteGaps.push('Home page exceeded the checker size limit.');
  if(site.email?.lookupFailed)siteGaps.push('Email DNS lookups were unavailable.');
  if(site.cert?.error)siteGaps.push('Certificate inspection was unavailable.');
  if(site.httpRedirect?.error)siteGaps.push('HTTP redirect inspection was unavailable.');
  if(site.altHost?.error)siteGaps.push('Alternate hostname inspection was unavailable.');
  phases.push({id:'site',status:siteGaps.length?'partial':'completed',note:siteGaps.join(' ')||'Home page, site files, email DNS, certificate and redirects inspected.'});
  const speedPromise = Promise.resolve().then(()=>speed(site.url,{apiKey})).catch(()=>({available:false,code:'request_failed',message:'Google mobile speed could not finish.'}));
  const targets = [...new Set((site.pages||[]).map(u=>{try{return normalizeUrl(u).href;}catch{return '';}}).filter(u=>u&&sameHost(u,site.url)))].slice(0,23);
  const batches=[]; for(let i=0;i<targets.length;i+=6)batches.push(targets.slice(i,i+6));
  const pages=[];
  for(let i=0;i<batches.length;i+=2) {
    const results = await Promise.all(batches.slice(i,i+2).map(async urls=>{
      try {return await checkPages(site.url,urls);}catch(error){return urls.map(url=>({url,error:safeMessage(error)}));}
    }));
    pages.push(...results.flat());
  }
  const pagesFailed = pages.filter(p=>p.error||p.truncated||p.notHtml||!(p.status>=200&&p.status<400));
  phases.push({id:'pages',status:pagesFailed.length?'partial':'completed',attempted:targets.length,completed:pages.length-pagesFailed.length,note:targets.length?'Checked the same bounded page set as the interactive checker.':'No additional pages discovered by the existing checker.'});
  const read=new Set([site.url,...targets].map(canonical));
  const remaining=new Set();
  for(const p of [site.home,...pages])for(const value of p.internal||[]) {
    try {const u=normalizeUrl(value).href;if(sameHost(u,site.url)&&!read.has(canonical(u)))remaining.add(u);}catch{}
  }
  const linkTargets=[...remaining].slice(0,60),links=[];
  for(let i=0;i<linkTargets.length;i+=30) {
    const urls=linkTargets.slice(i,i+30);
    try{links.push(...await checkLinks(site.url,urls));}catch(error){links.push(...urls.map(url=>({url,error:safeMessage(error)})));}
  }
  const linkUnknown=links.filter(l=>l.error||l.skipped).length;
  phases.push({id:'links',status:linkUnknown?'partial':'completed',attempted:linkTargets.length,completed:links.length-linkUnknown,note:linkTargets.length?'Internal link status checks finished; HTTP errors remain findings.':'No additional internal links to check.'});
  const speedResult=await speedPromise;
  phases.push({id:'mobile_speed',status:speedResult.available?'completed':'unavailable',note:speedResult.available?'Google mobile performance and accessibility measurement returned.':speedResult.message||'No Google mobile measurement.',...(speedResult.http_status?{http_status:speedResult.http_status}:{})});
  const report=buildReport({site,pages,links,speed:speedResult,now:now()});
  return {schema_version:1,engine:REPORT_VERSION,requested_url:url,checked_at:now().toISOString(),started_at,status:phases.every(p=>p.status==='completed')?'completed':'partial',phases,report};
}
