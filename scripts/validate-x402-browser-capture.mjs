import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {analyseBrowserCapture} from './x402-browser-capture.mjs';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--har','--netlog','--session','--fixture','--out'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('INVALID_ARGUMENT');options[args[i]]=args[i+1];}
for(const key of ['--har','--netlog','--session','--out'])if(!options[key])throw Error('CAPTURE_INPUT_REQUIRED');
if(['--har','--netlog','--session','--fixture'].filter(key=>options[key]).some(key=>resolve(options[key])===resolve(options['--out'])))throw Error('RAW_CAPTURE_MUST_NOT_BE_OVERWRITTEN');
const fileHashes={};const json=async file=>{const info=await stat(file);if(!info.isFile()||info.size>134217728)throw Error('CAPTURE_FILE_BOUND');const bytes=await readFile(file);fileHashes[file]=createHash('sha256').update(bytes).digest('hex');return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));};
let report;
try{report=analyseBrowserCapture({har:await json(options['--har']),netlog:await json(options['--netlog']),session:await json(options['--session']),...(options['--fixture']?{fixture:await json(options['--fixture'])}:{})});report.captureFileSha256={har:fileHashes[options['--har']],netlog:fileHashes[options['--netlog']],session:fileHashes[options['--session']],...(options['--fixture']?{fixture:fileHashes[options['--fixture']]}:{})};}
catch{report={version:1,status:'FAIL_CAPTURE',captureComplete:false,physicalWireObserved:false,failures:['CAPTURE_INPUT_INVALID_OR_TRUNCATED'],totals:null};}
await mkdir(dirname(resolve(options['--out'])),{recursive:true});await writeFile(resolve(options['--out']),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,captureComplete:report.captureComplete,failures:report.failures,totals:report.totals,physicalWireObserved:false}));if(!report.captureComplete)process.exitCode=1;
