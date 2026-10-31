// Uses the already deployed checker stages. Fixed destination; never fetches an
// arbitrary site's address itself or handles any user credential.
import {runWebsiteCheck} from './website-check-runner.mjs';
const ENDPOINT='https://ownersbehindit.com/.netlify/functions/website-check';
export async function runRemoteWebsiteCheck(site, {fetchImpl=fetch}={}) {
 const call=async body=>{
  const response=await fetchImpl(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok)throw new Error('Existing checker stage returned HTTP '+response.status);
  return response.json();
 };
 return runWebsiteCheck(site,{checkSite:url=>call({url}),checkPages:async(site,urls)=>(await call({mode:'pages',site,urls})).pages,checkLinks:async(site,urls)=>(await call({mode:'links',site,urls})).links});
}
