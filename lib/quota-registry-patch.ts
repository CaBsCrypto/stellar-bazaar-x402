// Internal transport optimization only. No key, quota, identity or CAS guard
// changes. JSON fragments keep arrays, escaping and opaque bytes unchanged.
import {WorkspaceError} from './workspace-types.ts';
import {freePlanTransportProfile} from './free-plan-transport-profile.ts';
export const QUOTA_REGISTRY_PATCH_MAX_BYTES = 16384;
const maximumRegistryBytes = 1048576;
export const COMPACT_WORKSPACE_REGISTRY_MAX_BYTES=131072;
export const COMPACT_WORKSPACE_REGISTRY_V2_MAX_BYTES=32768;
/** Opt-in capacity ceiling, never a data migration or quota reset. Native Lua
 * also enforces this ceiling before returning snapshots or writing records. */
export function workspaceRegistryTransportMaximum(environment:Readonly<Record<string,string|undefined>>=process.env):number {
 if(environment.BAZAAR_FREE_PLAN_TRANSPORT_PROFILE===undefined)return maximumRegistryBytes;
 return freePlanTransportProfile(environment)==='compact-registry-v2'?COMPACT_WORKSPACE_REGISTRY_V2_MAX_BYTES:COMPACT_WORKSPACE_REGISTRY_MAX_BYTES;
}
export function isCompactWorkspaceTransport(environment:Readonly<Record<string,string|undefined>>=process.env){return workspaceRegistryTransportMaximum(environment)!==maximumRegistryBytes;}
const fields = new Set(['revision', 'creationWindows', 'requestWindows', 'globalRequestQuota']);
type Entry = {key: string; start: number; end: number};
type ObjectScan = {entries: Entry[]; close: number};
const fail = (): never => { throw Error('INVALID_QUOTA_REGISTRY_PATCH'); };
function objectScan(raw: string): ObjectScan {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const space = (i: number) => { while (/^[ \r\n\t]$/.test(raw[i] ?? '')) i++; return i; };
  const stringEnd = (i: number) => { if (raw[i] !== '"') fail(); for (i++; i < raw.length; i++) { if (raw[i] === '\\') i++; else if (raw[i] === '"') return i + 1; } return fail(); };
  const valueEnd = (i: number) => {
    if (raw[i] === '"') return stringEnd(i);
    if (raw[i] === '{' || raw[i] === '[') {
      const stack: string[] = [raw[i++]];
      for (; i < raw.length; i++) {
        if (raw[i] === '"') i = stringEnd(i) - 1;
        else if (raw[i] === '{' || raw[i] === '[') { stack.push(raw[i]); if (stack.length > 128) fail(); }
        else if (raw[i] === '}' || raw[i] === ']') { const open = stack.pop(); if (open !== (raw[i] === '}' ? '{' : '[')) fail(); if (!stack.length) return i + 1; }
      }
      return fail();
    }
    while (i < raw.length && !/^[,}\] \r\n\t]$/.test(raw[i])) i++;
    return i;
  };
  let i = space(0); if (raw[i++] !== '{') fail(); i = space(i);
  const entries: Entry[] = [], seen = new Set<string>();
  if (raw[i] === '}') return {entries, close: i};
  for (;;) {
    const endKey = stringEnd(i), key: string = JSON.parse(raw.slice(i, endKey));
    if (seen.has(key)) fail(); seen.add(key); i = space(endKey); if (raw[i++] !== ':') fail();
    const start = space(i), end = valueEnd(start); entries.push({key, start, end}); i = space(end);
    if (raw[i] === '}') return {entries, close: i};
    if (raw[i++] !== ',') fail(); i = space(i);
  }
}
function validateFragment(key: string, raw: string) {
  const v = JSON.parse(raw), integer = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
  const exact = (v: unknown, keys: string[]) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === keys.sort().join(',');
  if (key === 'revision') { if (typeof v !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)) fail(); }
  else if (key === 'globalRequestQuota') { if (!exact(v, ['minute', 'minuteCount', 'day', 'dayCount']) || ![v.minute, v.minuteCount, v.day, v.dayCount].every(integer) || v.minuteCount > 1000 || v.dayCount > 10000 || v.day !== Math.floor(v.minute / 1440) || v.dayCount < v.minuteCount) fail(); }
  else { const name = key === 'creationWindows' ? 'key' : 'ownerId'; if (!Array.isArray(v) || v.some(row => !exact(row, [name, 'count', 'until']) || typeof row[name] !== 'string' || name === 'key' && Buffer.byteLength(row[name]) > 100 || !integer(row.count) || !integer(row.until))) fail(); }
}
export function applyQuotaRegistryPatch(original: string, patchRaw: string): string {
  if (Buffer.byteLength(original) > maximumRegistryBytes || Buffer.byteLength(patchRaw) > QUOTA_REGISTRY_PATCH_MAX_BYTES) fail();
  const patchScan = objectScan(patchRaw), patch = JSON.parse(patchRaw) as Record<string, string>;
  if (!patchScan.entries.length || !patchScan.entries.some(row => row.key === 'revision') || patchScan.entries.some(row => !fields.has(row.key) || typeof patch[row.key] !== 'string')) fail();
  for (const [key, value] of Object.entries(patch)) validateFragment(key, value);
  const scan = objectScan(original), present = new Set(scan.entries.map(row => row.key));
  if (!present.has('revision') || Object.keys(patch).some(key => !present.has(key) && key !== 'globalRequestQuota')) fail();
  const edits = scan.entries.filter(row => Object.hasOwn(patch, row.key)).map(row => ({start: row.start, end: row.end, text: patch[row.key]}));
  if (Object.hasOwn(patch, 'globalRequestQuota') && !present.has('globalRequestQuota')) {
    const position = scan.entries.at(-1)!.end;
    edits.push({start: position, end: position, text: ',"globalRequestQuota":' + patch.globalRequestQuota});
  }
  let result = original; for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  if (Buffer.byteLength(result) > maximumRegistryBytes) fail();
  JSON.parse(result); return result;
}
/** Both complete candidates have already passed native registry validation.
 * Any other change or byte-layout mismatch uses the original complete writer. */
export function prepareQuotaRegistryPatch(original: string, candidate: string): string | undefined {
  try {
    const oldScan = objectScan(original), nextScan = objectScan(candidate), old = new Map(oldScan.entries.map(row => [row.key, original.slice(row.start, row.end)])), next = new Map(nextScan.entries.map(row => [row.key, candidate.slice(row.start, row.end)]));
    if (old.size > next.size || [...old.keys()].some(key => !next.has(key)) || [...next.keys()].some(key => !old.has(key) && key !== 'globalRequestQuota')) return undefined;
    const patch: Record<string, string> = {};
    for (const [key, raw] of next) if (old.get(key) !== raw) { if (!fields.has(key)) return undefined; patch[key] = raw; }
    if (!patch.revision) return undefined;
    const compact = JSON.stringify(patch); if (Buffer.byteLength(compact) > QUOTA_REGISTRY_PATCH_MAX_BYTES) return undefined;
    return applyQuotaRegistryPatch(original, compact) === candidate ? compact : undefined;
  } catch { return undefined; }
}

// Lua scans raw JSON; it never re-encodes the registry or any untouched field.
// Redis calls occur only in the original surrounding CAS and storage scripts.
export const QUOTA_REGISTRY_PATCH_LUA = String.raw`
local function quota_space(raw,i)
 while i<=#raw do local b=string.byte(raw,i);if b~=32 and b~=9 and b~=10 and b~=13 then break end;i=i+1 end;return i
end
local function quota_string_end(raw,i)
 if string.byte(raw,i)~=34 then return nil end;i=i+1
 while i<=#raw do local b=string.byte(raw,i)
  if b==34 then return i+1 end
  if b==92 then i=i+1;local e=string.sub(raw,i,i)
   if e=='u' then if not string.match(string.sub(raw,i+1,i+4),'^%x%x%x%x$') then return nil end;i=i+4
   elseif e~='"' and string.byte(e)~=92 and e~='/' and e~='b' and e~='f' and e~='n' and e~='r' and e~='t' then return nil end
  elseif b<32 then return nil end;i=i+1
 end;return nil
end
local quota_value_end
local function quota_number_end(raw,i)
 if string.sub(raw,i,i)=='-' then i=i+1 end
 local b=string.byte(raw,i);if not b then return nil end
 if b==48 then i=i+1 elseif b>=49 and b<=57 then repeat i=i+1;b=string.byte(raw,i) until not b or b<48 or b>57 else return nil end
 if string.sub(raw,i,i)=='.' then i=i+1;local start=i;b=string.byte(raw,i);while b and b>=48 and b<=57 do i=i+1;b=string.byte(raw,i) end;if i==start then return nil end end
 local e=string.sub(raw,i,i);if e=='e' or e=='E' then i=i+1;e=string.sub(raw,i,i);if e=='+' or e=='-' then i=i+1 end;local start=i;b=string.byte(raw,i);while b and b>=48 and b<=57 do i=i+1;b=string.byte(raw,i) end;if i==start then return nil end end
 return i
end
quota_value_end=function(raw,i,depth)
 if depth>128 then return nil end;i=quota_space(raw,i);local c=string.sub(raw,i,i)
 if c=='"' then return quota_string_end(raw,i) end
 if c=='{' or c=='[' then local object=c=='{';local close=object and '}' or ']';i=quota_space(raw,i+1)
  if string.sub(raw,i,i)==close then return i+1 end
  while i<=#raw do
   if object then i=quota_string_end(raw,i);if not i then return nil end;i=quota_space(raw,i);if string.sub(raw,i,i)~=':' then return nil end;i=quota_space(raw,i+1) end
   i=quota_value_end(raw,i,depth+1);if not i then return nil end;i=quota_space(raw,i);local ending=string.sub(raw,i,i)
   if ending==close then return i+1 end;if ending~=',' then return nil end;i=quota_space(raw,i+1)
  end;return nil
 end
 for _,literal in ipairs({'true','false','null'}) do if string.sub(raw,i,i+#literal-1)==literal then return i+#literal end end
 return quota_number_end(raw,i)
end
local function quota_object_scan(raw)
 local ending=quota_value_end(raw,1,0);if not ending or quota_space(raw,ending)~=#raw+1 then return nil end
 local i=quota_space(raw,1);if string.sub(raw,i,i)~='{' then return nil end;i=quota_space(raw,i+1);local entries={};local seen={}
 if string.sub(raw,i,i)=='}' then return entries,i end
 while i<=#raw do local keyEnd=quota_string_end(raw,i);if not keyEnd then return nil end
  local ok,key=pcall(cjson.decode,string.sub(raw,i,keyEnd-1));if not ok or type(key)~='string' or seen[key] then return nil end;seen[key]=true
  i=quota_space(raw,keyEnd);if string.sub(raw,i,i)~=':' then return nil end;local start=quota_space(raw,i+1);local stop=quota_value_end(raw,start,0);if not stop then return nil end
  table.insert(entries,{key=key,start=start,stop=stop});i=quota_space(raw,stop)
  if string.sub(raw,i,i)=='}' then return entries,i end;if string.sub(raw,i,i)~=',' then return nil end;i=quota_space(raw,i+1)
 end;return nil
end
local function quota_integer(n) return type(n)=='number' and n>=0 and n<=9007199254740991 and n%1==0 end
local function quota_exact(v,names)
 if type(v)~='table' then return false end;local count=0;for k,_ in pairs(v) do if not names[k] then return false end;count=count+1 end;local expected=0;for _,_ in pairs(names) do expected=expected+1 end;return count==expected
end
local function quota_fragment(key,raw)
 local ending=quota_value_end(raw,1,0);if not ending or quota_space(raw,ending)~=#raw+1 then return false end
 local ok,v=pcall(cjson.decode,raw);if not ok then return false end
 if key=='revision' then return type(v)=='string' and #v==36 and string.match(v,'^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$')~=nil end
 if key=='globalRequestQuota' then return string.sub(raw,quota_space(raw,1),quota_space(raw,1))=='{' and quota_exact(v,{minute=true,minuteCount=true,day=true,dayCount=true}) and quota_integer(v.minute) and quota_integer(v.minuteCount) and quota_integer(v.day) and quota_integer(v.dayCount) and v.minuteCount<=1000 and v.dayCount<=10000 and v.day==math.floor(v.minute/1440) and v.dayCount>=v.minuteCount end
 if type(v)~='table' or string.sub(raw,quota_space(raw,1),quota_space(raw,1))~='[' then return false end
 local name=key=='creationWindows' and 'key' or 'ownerId';for _,row in ipairs(v) do
  local names={count=true,['until']=true};names[name]=true;if not quota_exact(row,names) or type(row[name])~='string' or name=='key' and #row[name]>100 or not quota_integer(row.count) or not quota_integer(row['until']) then return false end
 end;return true
end
local function quota_apply_registry_patch(original,raw)
 if #original>1048576 or #raw>16384 then return nil end
 local patchEntries=quota_object_scan(raw);local oldEntries=quota_object_scan(original);if not patchEntries or not oldEntries or #patchEntries<1 then return nil end
 local ok,patch=pcall(cjson.decode,raw);if not ok or type(patch)~='table' then return nil end
 local allowed={revision=true,creationWindows=true,requestWindows=true,globalRequestQuota=true};local present={};for _,row in ipairs(oldEntries) do present[row.key]=true end
 if not present.revision or type(patch.revision)~='string' then return nil end
 for _,row in ipairs(patchEntries) do if not allowed[row.key] or type(patch[row.key])~='string' or not quota_fragment(row.key,patch[row.key]) or not present[row.key] and row.key~='globalRequestQuota' then return nil end end
 local parts={};local position=1
 for _,row in ipairs(oldEntries) do if patch[row.key] then table.insert(parts,string.sub(original,position,row.start-1));table.insert(parts,patch[row.key]);position=row.stop end end
 if patch.globalRequestQuota and not present.globalRequestQuota then local ending=oldEntries[#oldEntries].stop;table.insert(parts,string.sub(original,position,ending-1));table.insert(parts,',"globalRequestQuota":'..patch.globalRequestQuota);position=ending end
 table.insert(parts,string.sub(original,position));local rebuilt=table.concat(parts);if #rebuilt>1048576 then return nil end;return rebuilt
end
`;
