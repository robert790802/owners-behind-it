import {readdir,cp,mkdir,rm} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'dist');await rm(out,{recursive:true,force:true});await mkdir(out);
const types=new Set(['.html','.css','.js','.json','.txt','.xml','.ico','.vcf','.webmanifest']);
for(const entry of await readdir(root,{withFileTypes:true})){
 if(entry.isDirectory()&&!['images','videos'].includes(entry.name))continue;
 if(entry.isFile()&&!types.has(path.extname(entry.name))&&!['_headers','_redirects'].includes(entry.name))continue;
 if(entry.name.startsWith('.'))continue;
 await cp(path.join(root,entry.name),path.join(out,entry.name),{recursive:true});
}
console.log('Static website staged in dist; server functions and tests stay outside the public directory.');
