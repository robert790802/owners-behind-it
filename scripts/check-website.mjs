import {writeFile} from 'node:fs/promises';
import {runRemoteWebsiteCheck} from '../server/website-check-remote.mjs';
const [site,output]=process.argv.slice(2);
if(!site){console.error('Usage: node scripts/check-website.mjs https://business.example [result.json]');process.exit(2);}
const result=await runRemoteWebsiteCheck(site);
const text=JSON.stringify(result,null,2)+'\n';
if(output)await writeFile(output,text);else process.stdout.write(text);
// Partial is a result with explicitly incomplete phases, never success-as-complete.
process.exitCode=result.status==='completed'?0:result.status==='partial'?3:2;
