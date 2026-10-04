import {createHash} from 'node:crypto';

const numericFields=['redis','commandsUpperBound','outboundPayloadBytes','inboundPayloadBytes','workspaceStoredBytesUpperBound','marketStoredBytesUpperBound','reviewStoredBytesUpperBound','catalogStoredBytesUpperBound','externalOutboundPayloadBytes','externalInboundPayloadBytes'];
const externalFields=['horizon','proof-dns','proof-http','provider'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const number=value=>Number.isSafeInteger(value)&&value>=0;

/** Pure NDJSON parser: retain every valid observation; deduplication is reconciliation. */
export function parseVercelMeterExport(raw,{deploymentId}={}){
 if(typeof raw!=='string'||typeof deploymentId!=='string'||!/^dpl_[A-Za-z0-9_-]+$/.test(deploymentId))throw Error('INVALID_METER_EXPORT_INPUT');
 const records=[],skipped=[];let rawRecords=0;
 const skip=(value,type)=>{const text=typeof value==='string'?value:JSON.stringify(value)??'undefined';skipped.push({type,bytes:Buffer.byteLength(text),hash:createHash('sha256').update(text).digest('hex')});};
 const inspect=(message,truncated,row)=>{
  if(truncated===true){skip(message,'truncated-message');return;}
  if(truncated!==undefined&&truncated!==false){skip(message,'invalid-truncation-flag');return;}
  if(typeof message!=='string'){skip(message,'non-string-message');return;}
  let count;try{count=JSON.parse(message);}catch{skip(message,message.includes('acceptanceMeter')?'malformed-meter-message':'non-json-message');return;}
  if(!object(count)||!Object.hasOwn(count,'acceptanceMeter')){skip(message,'non-v1-meter-message');return;}
  if(count.acceptanceMeter!=='v1'){skip(message,'unsupported-meter-version');return;}
  if(!['api','ssr'].includes(count.source)||typeof count.requestId!=='string'||!uuid.test(count.requestId)||typeof count.uncertain!=='boolean'||!numericFields.every(key=>number(count[key]))||!object(count.external)||!externalFields.every(key=>number(count.external[key]))||Object.keys(count.external).some(key=>!externalFields.includes(key))){skip(message,'invalid-v1-meter');return;}
  const path=row.requestPath===undefined||row.requestPath===null?'':typeof row.requestPath==='string'?row.requestPath.split(/[?#]/,1)[0]:undefined;
  if(path===undefined||path!==''&&!path.startsWith('/')){skip(message,'invalid-meter-path');return;}
  records.push({deploymentId,source:count.source,requestId:count.requestId,path,...Object.fromEntries(numericFields.map(key=>[key,count[key]])),external:Object.fromEntries(externalFields.map(key=>[key,count.external[key]])),uncertain:count.uncertain});
 };
 for(const line of raw.split(/\r?\n/)){
  if(!line.trim())continue;
  // Count malformed nonempty lines conservatively too. CLI's limit bounds rows,
  // while a row may contain several meter blocks and duplicate observations.
  rawRecords++;let row;try{row=JSON.parse(line);}catch{skip(line,'malformed-export-row');continue;}
  if(!object(row)){skip(line,'non-object-export-row');continue;}
  if(Object.hasOwn(row,'message'))inspect(row.message,row.messageTruncated,row);
  if(row.logs!==undefined){
   if(!Array.isArray(row.logs)){skip(row.logs,'invalid-logs-container');continue;}
   for(const log of row.logs){if(!object(log)){skip(log,'invalid-log-entry');continue;}inspect(log.message,log.messageTruncated,row);}
  }
 }
 return {records,rawRecords,skipped};
}
