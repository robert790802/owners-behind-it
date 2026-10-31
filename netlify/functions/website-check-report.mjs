// Public read-only API: the same website checker without opening a browser.
import {runWebsiteCheck,REPORT_VERSION} from '../../server/website-check-runner.mjs';
import {normalizeUrl} from './website-check.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createHandler(run=runWebsiteCheck, getKey=()=>typeof Netlify==='undefined'?'':Netlify.env.get('PAGESPEED_SERVER_API_KEY')||'') {
 return async request=>{
  if(!['GET','POST'].includes(request.method))return json({error:'Use GET or POST.'},405);
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return json({error:'Cross-origin browser calls are not supported.'},403);
  let input;
  try{
   if(request.method==='GET')input=new URL(request.url).searchParams.get('site');
   else {if(Number(request.headers.get('content-length'))>4096)return json({error:'Request is too large.'},413);const raw=await request.text();if(raw.length>4096)return json({error:'Request is too large.'},413);input=JSON.parse(raw).site;}
   input=normalizeUrl(input).href;
  }catch{return json({error:'Supply a valid public website in site.'},400);}
  // Individual checker stages are bounded at 8.5 s; speed is 45 s in parallel.
  // This guard keeps the public response below Netlify's 60-second sync limit.
  let timer;
  const started_at=new Date().toISOString();
  try{
   const result=await Promise.race([run(input,{apiKey:getKey()}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('deadline')),55000);timer.unref?.();})]);
   return json(result);
  }catch{return json({schema_version:1,engine:REPORT_VERSION,requested_url:input,started_at,checked_at:new Date().toISOString(),status:'unavailable',phases:[{id:'site',status:'unavailable',note:'The full check did not finish in the time allowed. No completed report was recorded.'}],report:null},504);}
  finally{clearTimeout(timer);}
 };
}
export default createHandler();
export const config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:4}};
