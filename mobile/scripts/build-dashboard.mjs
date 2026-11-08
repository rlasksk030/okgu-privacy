import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname,extname} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const engine=process.env.OKGU_ESBUILD_MODULE;
const {build}=await import(engine?pathToFileURL(engine).href:'esbuild');
const publicDir=resolve(root,'public'),assets={};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
for(const name of (await readdir(publicDir)).sort()){
 const ext=extname(name);if(!types[ext])continue;
 const data=await readFile(resolve(publicDir,name));
 assets['/'+name]={type:types[ext],body:data.toString(ext==='.png'?'base64':'utf8'),binary:ext==='.png'};
}
assets['/']=assets['/index.html'];
await mkdir(resolve(root,'dist'),{recursive:true});
const entry=`import worker from './src/worker.mjs';
const assets=${JSON.stringify(assets)};
const ASSETS={async fetch(request){const path=new URL(request.url).pathname,a=assets[path];if(!a)return new Response('Not Found',{status:404});return new Response(request.method==='HEAD'?null:a.binary?Uint8Array.from(atob(a.body),c=>c.charCodeAt(0)):a.body,{headers:{'Content-Type':a.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});}};
export default {fetch(request,env,ctx){return worker.fetch(request,{...env,ASSETS},ctx);},scheduled(event,env,ctx){return worker.scheduled(event,env,ctx);}};`;
const result=await build({stdin:{contents:entry,resolveDir:root,sourcefile:'dashboard-entry.mjs'},bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',legalComments:'eof',write:false,alias:{'@block65/webcrypto-web-push':resolve(root,'vendor/web-push/lib/main.ts'),'uint8array-extras':resolve(root,'vendor/uint8array-extras/index.js')}});
const output=result.outputFiles[0].contents;
await writeFile(resolve(root,'dist/app.js'),output);
await writeFile(resolve(root,'dist/worker.js'),'export { default } from "./app.js";\n');
const manifest={file:'app.js',entrypoint:'worker.js',bytes:output.length,sha256:createHash('sha256').update(output).digest('hex'),esbuild:(await import(engine?pathToFileURL(engine).href:'esbuild')).version,sourceAssets:Object.keys(assets)};
await writeFile(resolve(root,'dist/build.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest));
