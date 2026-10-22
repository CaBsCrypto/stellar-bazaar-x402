import {readFile,mkdir,lstat,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,dirname,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),stage=resolve(root,'.vercel/continuous-provider-preview-source-20261011'),frozen=resolve(root,'.vercel/text-production-provider-source'),output=resolve(root,'.vercel/continuous-provider-preview-build-20261011');
const within=path=>{const part=relative(root,path);return part&&!part.startsWith('..')&&!isAbsolute(part);};
if(![stage,frozen,output].every(within))throw Error('LOCAL_BUILD_PATH_REQUIRED');
for(const path of [stage,frozen]){const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('REGULAR_LOCAL_SOURCE_REQUIRED');}
try{await lstat(output);throw Error('NEW_BUILD_DIRECTORY_REQUIRED');}catch(error){if(error.code!=='ENOENT')throw error;}
const ts=createRequire(join(frozen,'package.json'))('typescript'),raw=ts.readConfigFile(join(stage,'tsconfig.json'),ts.sys.readFile);if(raw.error)throw Error('PROVIDER_TSCONFIG_INVALID');
const parsed=ts.parseJsonConfigFileContent(raw.config,ts.sys,stage,{outDir:output,typeRoots:[join(frozen,'node_modules/@types')]});
const host=ts.createCompilerHost(parsed.options);
host.resolveModuleNames=(names,containingFile)=>names.map(name=>ts.resolveModuleName(name,name.startsWith('.')?containingFile:join(frozen,'server.ts'),parsed.options,host).resolvedModule);
const program=ts.createProgram(parsed.fileNames,parsed.options,host),diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){console.log(JSON.stringify({status:'FAIL',networkRequests:0,diagnostics:diagnostics.map(d=>({code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' '),file:d.file?relative(stage,d.file.fileName).replaceAll('\\','/'):null}))}));process.exitCode=1;}
else{
 await mkdir(output);const emit=program.emit();if(emit.emitSkipped||emit.diagnostics.length)throw Error('PROVIDER_BUILD_UNCONFIRMED');
 const emitted=[];async function inventory(path,prefix=''){for(const entry of await readdir(path,{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('BUILD_SYMLINK_FORBIDDEN');if(entry.isDirectory())await inventory(join(path,entry.name),prefix+entry.name+'/');else emitted.push(prefix+entry.name);}}await inventory(output);
 const manifest=JSON.parse(await readFile(resolve(root,'docs/evidence/continuous-provider-source-2026-10-11.json'),'utf8'));
 console.log(JSON.stringify({status:'PASS',sourceDigest:manifest.sourceDigest,typescriptVersion:ts.version,emittedFiles:emitted.sort(),sourceDirectory:relative(root,stage).replaceAll('\\','/'),buildDirectory:relative(root,output).replaceAll('\\','/'),dependencies:'accepted frozen provider installed dependencies; no copies or installation',packageSourceModified:false,networkRequests:0,secretReads:0,payments:0,cronActivated:false,productionPublished:false,limitation:'Deployment dependency installation and hosted invocation remain separate acceptance gates.'}));
}
