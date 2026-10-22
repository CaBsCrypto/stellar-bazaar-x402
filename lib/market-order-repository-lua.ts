/** Local-development v2 storage. No expiry, retries, or legacy financial writes. */
export const MARKET_ORDER_REPOSITORY_CAS = `-- bazaar-per-order-cas-v2-local
local id=ARGV[6]
if id=='31c97193-be74-4b9d-b0a3-f3890b0a41e8' then return -31 end
local function keytype(key)
 local reply=redis.call('TYPE',key)
 if type(reply)=='table' then return reply.ok end
 return reply
end
-- Redis Lua is isolated but has no rollback after a runtime error. Check all
-- destination types before any write, including indexes and permanent claims.
for n,key in ipairs(KEYS) do
 local wanted=(n==2 or n==3 or n==4 or n==10 or n==12 or n==13) and 'zset' or 'string'
 local actual=keytype(key)
 if actual~='none' and actual~=wanted then return -8 end
end
local old=redis.call('GET',KEYS[1])
if ARGV[1]=='missing' then if old then return 0 end else if not old or old~=ARGV[2] then return 0 end end
if #ARGV[3]>196608 or #ARGV[13]>196608 then return -24 end
local market=redis.call('GET',KEYS[7])
local settlements=redis.call('GET',KEYS[8])
local fingerprint=ARGV[9]
local function legacy(raw,kind,maximum)
 if not raw then return 1 end
 if #raw>maximum then return -8 end
 local ok,e=pcall(cjson.decode,raw)
 if not ok or type(e)~='table' or e.version~=1 or type(e.revision)~='string' or type(e.state)~='table' or e.state.version~=1 then return -8 end
 local arrays={}
 if kind=='market' then
  if type(e.state.orders)~='table' or type(e.state.services)~='table' then return -8 end
  arrays={e.state.orders,e.state.archived or {}}
 else
  if type(e.state.records)~='table' then return -8 end
  arrays={e.state.records}
 end
 for _,rows in ipairs(arrays) do
  if type(rows)~='table' then return -8 end
  for _,row in ipairs(rows) do
   if type(row)~='table' or type(row.operationId)~='string' then return -8 end
   if row.operationId==id then return -7 end
   if fingerprint~='' and row.authorizationFingerprint==fingerprint then return -9 end
  end
 end
 return 1
end
local legacyMarket=legacy(market,'market',524288)
if legacyMarket~=1 then return legacyMarket end
local legacySettlement=legacy(settlements,'settlement',131072)
if legacySettlement~=1 then return legacySettlement end
local guards=cjson.decode(ARGV[11])
for n,wanted in ipairs(guards) do
 local actual=redis.call('GET',KEYS[17+n])
 if wanted==cjson.null then if actual then return 0 end elseif not actual or actual~=wanted then return 0 end
end
if ARGV[12]~='' then
 local deadline=tonumber(ARGV[12]);if not deadline or deadline<=0 then return -2 end
 local clock=redis.call('TIME')
 if tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)>=deadline then return -1 end
end
if fingerprint~='' then
 local claim=redis.call('GET',KEYS[9])
 if claim and claim~=id then return -9 end
end
-- Every precondition precedes the first write. Unknown ACKs are not retried.
redis.call('SET',KEYS[1],ARGV[3])
redis.call('SET',KEYS[17],ARGV[13])
redis.call('ZADD',KEYS[2],0,ARGV[4])
redis.call('ZADD',KEYS[3],0,ARGV[4])
redis.call('SET',KEYS[5],ARGV[5])
redis.call('SET',KEYS[6],ARGV[5])
redis.call('SET',KEYS[11],ARGV[5])
redis.call('ZADD',KEYS[12],0,ARGV[4])
redis.call('ZADD',KEYS[13],0,ARGV[4])
redis.call('SET',KEYS[14],ARGV[5])
redis.call('SET',KEYS[15],ARGV[5])
redis.call('SET',KEYS[16],ARGV[5])
if ARGV[10]=='1' then
 redis.call('ZADD',KEYS[4],0,ARGV[4])
 redis.call('ZADD',KEYS[10],0,ARGV[4])
else
 redis.call('ZREM',KEYS[4],ARGV[4])
 redis.call('ZREM',KEYS[10],ARGV[4])
end
if fingerprint~='' then redis.call('SET',KEYS[9],id) end
return 1`;

/** The index and its revision are observed in one atomic bounded operation. */
export const MARKET_ORDER_REPOSITORY_PAGE = `-- bazaar-per-order-page-v2-local
local t=redis.call('TYPE',KEYS[1]);if type(t)=='table' then t=t.ok end
if t~='none' and t~='zset' then return {-8,{}} end
local r=redis.call('TYPE',KEYS[2]);if type(r)=='table' then r=r.ok end
if r~='none' and r~='string' then return {-8,{}} end
local revision=redis.call('GET',KEYS[2])
local rows=redis.call('ZREVRANGEBYLEX',KEYS[1],ARGV[1],'-','LIMIT',0,tonumber(ARGV[2]))
return {revision or '',rows}`;

/** Atomic bounded private-history page. Return original JSON strings, never
 * cjson re-encoded input numbers. The first record must fit; an overrun after
 * it remains the next page's first member, so no record is skipped. */
export const MARKET_ORDER_REPOSITORY_HISTORY_PAGE = `-- bazaar-per-order-history-page-v3
if #KEYS~=2 or #ARGV~=5 then return -8 end
local namespace=ARGV[3];local who=ARGV[4];local role=ARGV[5]
if #namespace>128 or not string.match(namespace,'^bazaar%-market:[a-z]+%-%x+:orders:v2:$') then return -8 end
if role~='buyer' and role~='seller' and role~='participant' and role~='work' then return -8 end
if role=='work' then if who~='' or KEYS[1]~=namespace..'work' then return -8 end
elseif #who~=35 or string.sub(who,1,3)~='ow_' then return -8 end
if KEYS[2]~=KEYS[1]..':revision' then return -8 end
local t=redis.call('TYPE',KEYS[1]);if type(t)=='table' then t=t.ok end
local r=redis.call('TYPE',KEYS[2]);if type(r)=='table' then r=r.ok end
if (t~='none' and t~='zset') or (r~='none' and r~='string') then return -8 end
local count=tonumber(ARGV[2]);if not count or count%1~=0 or count<2 or count>51 then return -8 end
local revision=redis.call('GET',KEYS[2])
local members=redis.call('ZREVRANGEBYLEX',KEYS[1],ARGV[1],'-','LIMIT',0,count)
if #members>0 and not revision then return -8 end
local values={};local total=0
for i=1,math.min(#members,count-1) do
 local member=members[i]
 if type(member)~='string' or #member~=61 or string.sub(member,25,25)~='|' then return -8 end
 local id=string.sub(member,26)
 if id=='31c97193-be74-4b9d-b0a3-f3890b0a41e8' then return -31 end
 local a,b,c,d,e=string.match(id,'^(%x+)%-(%x+)%-(%x+)%-(%x+)%-(%x+)$')
 if #id~=36 or not a or #a~=8 or #b~=4 or #c~=4 or #d~=4 or #e~=12 or string.sub(c,1,1)~='4' or not string.find('89ab',string.sub(d,1,1),1,true) then return -8 end
 local raw=redis.call('GET',namespace..'history:'..id)
 if type(raw)~='string' or #raw>196608 then return -24 end
 local valid,value=pcall(cjson.decode,raw)
 if not valid or type(value)~='table' or value.operationId~=id or type(value.createdAt)~='string' or value.createdAt..'|'..id~=member or value.settlement~=nil then return -8 end
 if role=='buyer' and value.buyerOwnerId~=who or role=='seller' and value.sellerOwnerId~=who or role=='participant' and value.buyerOwnerId~=who and value.sellerOwnerId~=who then return -8 end
 if total+#raw+1>126976 then if #values==0 then return -24 end;break end
 total=total+#raw+1;table.insert(values,raw)
end
return {revision or '',members,values}`;

export const MARKET_ORDER_REPOSITORY_READ = `-- bazaar-per-order-read-v2-local
local raw=redis.call('GET',KEYS[1])
-- Native validator: unmarked metadata2188 + order65536 + settlement65536 + framing23; marked envelopes have a smaller reserved payload.
-- Invalid larger values fail before their content crosses the Redis boundary.
if raw and #raw>133309 then return -24 end
return raw`;

/** The private-history projection is exact JS serialization in the same CAS.
 * Avoid Lua cjson decode/encode of numeric user input (which loses precision). */
export const MARKET_ORDER_REPOSITORY_HISTORY_READ = `-- bazaar-per-order-history-read-v2-local
local raw=redis.call('GET',KEYS[1])
if raw and #raw>67759 then return -24 end
return raw`;

/** A private, bounded capacity/quota projection; no card, input or payment
 * authorization is exposed to admission scans. Written with its order CAS. */
export const MARKET_ORDER_REPOSITORY_ADMISSION_READ = `-- bazaar-per-order-admission-read-v1
local raw=redis.call('GET',KEYS[1])
if raw and #raw>4096 then return -24 end
return raw`;

/** Only an authenticated native envelope profile selects this narrower read. */
export const MARKET_ORDER_REPOSITORY_BATCH_READ = `-- bazaar-per-order-batch-read-v1
local raw=redis.call('GET',KEYS[1])
if not raw then return false end
if #raw>101390 then return -24 end
local ok,record=pcall(cjson.decode,raw)
if not ok or type(record)~='table' or record.budgetProfile~='batch-v1' then return -24 end
return raw`;

/** Same atomic owner-scoped page, specialized to canonical admission summaries.
 * Native writer maximum4096 bytes; oversized/corrupt rows fail before return. */
export const MARKET_ORDER_REPOSITORY_ADMISSION_PAGE=MARKET_ORDER_REPOSITORY_HISTORY_PAGE
 .replace('-- bazaar-per-order-history-page-v3','-- bazaar-per-order-admission-page-v2')
 .replace("if role~='buyer' and role~='seller' and role~='participant' and role~='work' then return -8 end","if role~='buyer' and role~='seller' and role~='seller-pending' then return -8 end")
 .replace("local values={};local total=0","local values=cjson.decode('[]');local total=0")
 .replace("namespace..'history:'..id","namespace..'admission:'..id")
 .replace('#raw>196608','#raw>4096')
 .replace("role=='seller' and value.sellerOwnerId~=who","(role=='seller' or role=='seller-pending') and value.sellerOwnerId~=who")
 .replace('total+#raw+1>126976','total+#raw+1>204850');
