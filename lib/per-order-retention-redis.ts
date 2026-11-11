import {createHash} from 'node:crypto';
import type {NativeRedisDescriptor} from './catalog-budget.ts';
import {WorkspaceError} from './workspace-types.ts';

const ownerPattern=/^ow_[a-f0-9]{32}$/;
const memberPattern=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\|[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const legacy='31c97193-be74-4b9d-b0a3-f3890b0a41e8';
export const RETENTION_PAGE_SIZE=3;
export const RETENTION_CHECKPOINT_LIMIT=97;
export const retentionOwner=(value:unknown):value is string=>typeof value==='string'&&ownerPattern.test(value);
export function retentionMember(value:unknown):value is string{
 if(typeof value!=='string'||!memberPattern.test(value)||value.slice(25)===legacy)return false;
 const date=value.slice(0,24),time=Date.parse(date);
 return Number.isFinite(time)&&new Date(time).toISOString()===date;
}
export function retentionCheckpoint(value:unknown){
 if(typeof value!=='string'||value.length>RETENTION_CHECKPOINT_LIMIT)return undefined;
 const owner=value.slice(0,35),after=value.slice(36);
 if(!retentionOwner(owner)||(value.length!==35&&(value[35]!=='|'||!retentionMember(after))))return undefined;
 return {owner,after:after||undefined};
}
export const retentionCheckpointKey=(namespace:string)=>namespace+'retention-checkpoint:v1';
export const retentionBuyerKey=(namespace:string,owner:string)=>namespace+'buyer:'+createHash('sha256').update(owner).digest('hex');

export const READ_PER_ORDER_RETENTION_CHECKPOINT=`-- bazaar-per-order-retention-read-v1
if #KEYS~=1 or #ARGV~=0 then return -8 end
local raw=redis.call('GET',KEYS[1])
if raw and #raw>${RETENTION_CHECKPOINT_LIMIT} then return -8 end
local clock=redis.call('TIME')
return {raw or '',clock[1],clock[2]}`;

// One fixed-size control checkpoint, covered by the native technical reserve.
// It is only advanced after an acknowledged archive or an inspected page.
export const WRITE_PER_ORDER_RETENTION_CHECKPOINT=`-- bazaar-per-order-retention-write-v1
if #KEYS~=1 or #ARGV~=2 or #ARGV[1]>${RETENTION_CHECKPOINT_LIMIT} or #ARGV[2]>${RETENTION_CHECKPOINT_LIMIT} or #ARGV[2]<35 then return -8 end
local raw=redis.call('GET',KEYS[1])
if (raw or '')~=ARGV[1] then return 0 end
redis.call('SET',KEYS[1],ARGV[2]);return 1`;

// Discover IDs from the existing buyer index and content-free admission
// projections. The extra row detects continuation without reading its value.
export const FIND_PER_ORDER_RETENTION_CANDIDATE=`-- bazaar-per-order-retention-candidate-v1
if #KEYS~=1 or #ARGV~=3 or #ARGV[3]~=62 or string.sub(ARGV[3],1,1)~='(' then return -8 end
local members=redis.call('ZREVRANGEBYLEX',KEYS[1],ARGV[3],'-','LIMIT',0,${RETENTION_PAGE_SIZE+1})
local last=''
for i=1,math.min(#members,${RETENTION_PAGE_SIZE}) do
 local member=members[i]
 if type(member)~='string' or #member~=61 or string.sub(member,25,25)~='|' then return -8 end
 local id=string.sub(member,26)
 if id=='${legacy}' then return -8 end
 local a,b,c,d,e=string.match(id,'^(%x+)%-(%x+)%-(%x+)%-(%x+)%-(%x+)$')
 if not a or #a~=8 or #b~=4 or #c~=4 or #d~=4 or #e~=12 or string.sub(c,1,1)~='4' or not string.find('89ab',string.sub(d,1,1),1,true) then return -8 end
 local raw=redis.call('GET',ARGV[1]..'admission:'..id)
 if type(raw)~='string' or #raw>4096 then return -8 end
 local valid,row=pcall(cjson.decode,raw)
 if not valid or type(row)~='table' or row.version~=1 or row.operationId~=id or row.buyerOwnerId~=ARGV[2] or type(row.createdAt)~='string' or row.createdAt..'|'..id~=member then return -8 end
 last=member
 if type(row.phase)=='string' and row.paymentPhase==nil and row.archivedAt==nil then return {i,last,last,i<#members and 1 or 0} end
 if row.phase~=nil or type(row.archivedAt)~='string' or not (row.paymentPhase=='unpaid' or row.paymentPhase=='rejected' or row.paymentPhase=='uncertain' or row.paymentPhase=='confirmed') then return -8 end
end
return {math.min(#members,${RETENTION_PAGE_SIZE}),last,'',#members>${RETENTION_PAGE_SIZE} and 1 or 0}`;

export function perOrderRetentionRedisDescriptor(script:string,keys:unknown[],args:unknown[],namespace:string):NativeRedisDescriptor|undefined{
 const fail=()=>{throw new WorkspaceError('PER_ORDER_TRANSPORT_BUDGET',503,60);};
 if(script===READ_PER_ORDER_RETENTION_CHECKPOINT||script===WRITE_PER_ORDER_RETENTION_CHECKPOINT){
  if(keys.length!==1||keys[0]!==retentionCheckpointKey(namespace))return fail();
  if(script===READ_PER_ORDER_RETENTION_CHECKPOINT){if(args.length)return fail();}
  else if(args.length!==2||(args[0]!==''&&!retentionCheckpoint(args[0]))||!retentionCheckpoint(args[1]))return fail();
  return {commands:3,responseBytes:512,keys:keys as string[]};
 }
 if(script===FIND_PER_ORDER_RETENTION_CANDIDATE){
  const [scope,owner,upper]=args;
  if(keys.length!==1||args.length!==3||scope!==namespace||!retentionOwner(owner)||keys[0]!==retentionBuyerKey(namespace,owner)||typeof upper!=='string'||upper[0]!=='('||!retentionMember(upper.slice(1)))return fail();
  return {commands:2+RETENTION_PAGE_SIZE,responseBytes:512,keys:keys as string[]};
 }
}
