(() => {
'use strict';
const $=id=>document.getElementById(id);
let checkedUrl='', speedController;
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const labels={found:'Found',attention:'Needs attention',review:'Review',unknown:'Couldn’t confirm'};
async function request(body,signal){const response=await fetch('/.netlify/functions/website-check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});let data;try{data=await response.json();}catch{throw new Error('The checker is temporarily unavailable. Please try again shortly.');}if(!response.ok)throw new Error(data.error||'The check could not finish. Please try again later.');return data;}
$('check-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;button.textContent='Checking your website…';$('error').hidden=true;$('results').hidden=true;$('progress').textContent='Reading your homepage and checking its public search files…';speedController?.abort();
 try {
  const report=await request({url:$('website').value},AbortSignal.timeout(35000));checkedUrl=report.url;
  $('checked-url').textContent=report.url+' · '+new Date(report.checkedAt).toLocaleString();$('scope').textContent=report.scope;
  $('summary').replaceChildren();for(const [key,label] of [['found','Found'],['attention','Need attention'],['review','Review or couldn’t confirm']]){const box=el('div');box.append(el('strong',String(report.counts[key])),el('span',label));$('summary').append(box);}
  $('findings').replaceChildren();const groups=new Map();for(const f of report.findings){if(!groups.has(f.group)){const section=el('section',undefined,'group');section.append(el('h2',f.group));groups.set(f.group,section);$('findings').append(section);}const row=el('article',undefined,'finding'),left=el('div'),right=el('div');left.append(el('h3',f.label),el('span',labels[f.status]||'Review','badge '+f.status));right.append(el('p',f.evidence,'evidence'));if(f.next)right.append(el('p',f.next,'next'));row.append(left,right);groups.get(f.group).append(row);}
  const hostname=new URL(report.url).hostname;$('search-links').replaceChildren();for(const [label,base] of [['Look on Google','https://www.google.com/search?q='],['Look on Bing','https://www.bing.com/search?q=']]){const a=el('a',label+' ↗');a.href=base+encodeURIComponent('site:'+hostname);a.target='_blank';a.rel='noopener noreferrer';$('search-links').append(a);}
  $('speed-result').replaceChildren();$('speed-button').disabled=false;$('speed-button').textContent='Test mobile speed';$('progress').textContent='Your basic check is complete.';$('results').hidden=false;$('before-results').hidden=true;$('results').focus();
 }catch(error){$('progress').textContent='';$('error').textContent=error.name==='TimeoutError'?'This check took too long. The website may be slow or blocking automated requests. Please try again.':error.message;$('error').hidden=false;}
 finally{button.disabled=false;button.textContent='Check my website →';}
});
$('speed-button').addEventListener('click',async()=>{
 const url=checkedUrl;if(!url)return;speedController=new AbortController();const controller=speedController;
 $('speed-button').disabled=true;$('speed-result').textContent='Running the mobile speed measurement…';
 try{const data=await request({url,mode:'speed'},AbortSignal.any([controller.signal,AbortSignal.timeout(55000)]));if(url!==checkedUrl||controller.signal.aborted)return;const box=$('speed-result');box.replaceChildren();if(data.available){box.append(el('h3','Mobile performance: '+data.score+'/100'));for(const metric of data.metrics)if(metric.label&&metric.value)box.append(el('p',metric.label+': '+metric.value));}box.append(el('p',data.message));}
 catch(error){if(error.name!=='AbortError')$('speed-result').textContent='The speed measurement is unavailable right now. No speed score has been assigned.';}
 finally{if(!controller.signal.aborted)$('speed-button').disabled=false;}
});
$('print').addEventListener('click',()=>window.print());
})();
