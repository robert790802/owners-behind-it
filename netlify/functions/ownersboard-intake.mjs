// Netlify validates platform-event signatures before invoking formSubmitted.
export async function forwardSubmission(data,env,send=fetch){
 const form=data.source_form;
 if(!['tell-your-story','visualizer-leads'].includes(form))return;
 if(!env.WEBSITE_WEBHOOK_SECRET||env.WEBSITE_WEBHOOK_SECRET.length<32)throw new Error('OwnersBoard handoff is not configured');
 if(!/^[0-9a-f-]{36}$/i.test(data.submission_id||'')||!data.submitted_at)throw new Error('Submission receipt fields are missing');
 // Only the fixed OwnersBoard endpoint receives the server-held secret.
 const result=await send('https://ownersboard-robert.netlify.app/.netlify/functions/website-webhook',{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.WEBSITE_WEBHOOK_SECRET},
  body:JSON.stringify({site_id:'a974c4ef-efc3-4771-8897-6607ca3a50ba',form_name:form,submission_id:data.submission_id,submitted_at:data.submitted_at,data}),signal:AbortSignal.timeout(20000)
 });
 if(!result.ok)throw new Error('OwnersBoard delivery failed ('+result.status+'). Netlify retains the submission.');
}
export default {async formSubmitted(event){await forwardSubmission(event.data,{WEBSITE_WEBHOOK_SECRET:Netlify.env.get('WEBSITE_WEBHOOK_SECRET')});}};
