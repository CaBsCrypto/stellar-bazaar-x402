import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {prepareX402Manifest} from './x402-acceptance-manifest.mjs';
const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!['--draft','--local','--capture','--previous-manifest','--previous-counters','--out'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('INVALID_ARGUMENT');options[args[i]]=args[i+1];}
for(const key of ['--draft','--previous-manifest','--previous-counters','--out'])if(!options[key])throw Error('PREPARATION_INPUT_REQUIRED');
const json=async file=>JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
if([options['--previous-manifest'],options['--previous-counters'],options['--draft']].map(path=>resolve(path)).includes(resolve(options['--out'])))throw Error('HISTORICAL_EVIDENCE_MUST_NOT_BE_OVERWRITTEN');
const manifest=prepareX402Manifest({draft:await json(options['--draft']),...(options['--local']?{localReport:await json(options['--local'])}:{}),...(options['--capture']?{capturePreflight:await json(options['--capture'])}:{}),previousManifestBytes:await readFile(options['--previous-manifest']),previousCountersBytes:await readFile(options['--previous-counters'])});
await mkdir(dirname(resolve(options['--out'])),{recursive:true});await writeFile(resolve(options['--out']),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:manifest.status,planId:manifest.planId,readiness:manifest.readiness,remoteEffects:0}));
