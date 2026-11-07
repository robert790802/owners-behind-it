import {FACTS} from '../../server/quick-answer-facts.mjs';

// Quick answers for ownersbehindit.com. Answers only from the approved fact sheet.
// Anything not covered gets the honest hand-off. The key never leaves Netlify.
const DOORS=['cal','os','tell','check','google','email','ohlson'];
const SYSTEM=`You are Robert's AI guide on ownersbehindit.com. Robert T. Szigeti builds websites for owner-led businesses in Palm Coast, St. Augustine and North Florida, starting every project with a sit-down conversation.

Answer ONLY from the FACTS below. Never invent prices, timelines, promises, guarantees or services that are not in the FACTS. If the FACTS do not answer the question, or it is about something unrelated, set "covered" to false.

Voice: Robert speaking in first person. Plain American English, warm and direct, short sentences, two to four sentences total. No em dashes. No marketing language. Never pressure anyone.

Return JSON only:
{"covered": true or false, "answer": "your answer", "ask": "one short question back to the owner, or empty", "doors": ["up to two of: cal (book a sit-down), os (The Owner Session), tell (tell Robert by voice), check (free website check), google (why am I not on Google), email (email Robert), ohlson (Ohlson before and after)"]}

Use the "Question back" from the matching fact when there is one.

FACTS:
${FACTS}`;

const FALLBACK={covered:false,answer:"I don't have that answer here yet, and I'd rather not guess. Robert will answer it himself: tell him about it in your own words, or book a sit-down.",ask:'',doors:['tell','cal']};

export function clean(out){
 if(!out||typeof out!=='object'||out.covered!==true||typeof out.answer!=='string'||!out.answer.trim())return FALLBACK;
 const answer=out.answer.replace(/\s*\u2014\s*/g,', ').trim().slice(0,900);
 const ask=typeof out.ask==='string'?out.ask.replace(/\s*\u2014\s*/g,', ').trim().slice(0,240):'';
 const doors=Array.isArray(out.doors)?out.doors.filter(d=>DOORS.includes(d)).slice(0,2):[];
 return {covered:true,answer,ask,doors:doors.length?doors:['cal']};
}

export default async (req)=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 let q='';
 try{q=String((await req.json()).question||'').trim();}catch{return Response.json(FALLBACK,{status:400});}
 if(!q||q.length>400)return Response.json(FALLBACK,{status:400});
 const key=Netlify.env.get('OPENAI_API_KEY');
 if(!key)return Response.json(FALLBACK);
 try{
  const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
   body:JSON.stringify({model:'gpt-4o-mini',temperature:0.2,max_tokens:400,response_format:{type:'json_object'},messages:[{role:'system',content:SYSTEM},{role:'user',content:q}]}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)return Response.json(FALLBACK);
  const data=await r.json();
  return Response.json(clean(JSON.parse(data.choices?.[0]?.message?.content||'{}')));
 }catch{return Response.json(FALLBACK);}
};

export const config={path:'/api/quick-answer'};
