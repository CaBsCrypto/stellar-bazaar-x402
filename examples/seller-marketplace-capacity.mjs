import {randomUUID} from 'node:crypto';
import {sellerCanonical,sellerHash} from './seller-service-card.mjs';
import {readSellerJournal,sellerTool,sellerUuid} from './seller-marketplace-worker.mjs';

export const SELLER_DAILY_EXECUTIONS=50;
const dayAt=value=>new Date(value).toISOString().slice(0,10);
function clock(now){const value=now();if(!Number.isSafeInteger(value)||value<0)throw Error('SELLER_CLOCK_UNCONFIRMED');return value;}
function validateDaily(value,ownerId){
 if(value?.version!==1||value.ownerId!==ownerId||!/^\d{4}-\d{2}-\d{2}$/.test(value.day??'')||!Number.isSafeInteger(value.lastObservedAt)||!Array.isArray(value.operations)||value.operations.length>SELLER_DAILY_EXECUTIONS||new Set(value.operations).size!==value.operations.length||value.operations.some(id=>!sellerUuid.test(id)))throw Error('SELLER_DAILY_STATE_UNCONFIRMED');return value;
}
/** One encrypted store is shared by every service of the seller. Reservations
 * count attempted execution, including a lost response, rather than success. */
export function createSellerExecutionBudget({store,ownerId,now=Date.now}){
 if(!store?.journal||!store?.acquireLock||!ownerId)throw Error('SELLER_DAILY_STATE_REQUIRED');
 const journal=store.journal('seller.execution-budget');
 async function read(){const value=clock(now),day=dayAt(value);let state=await readSellerJournal(journal);
  if(state){validateDaily(state,ownerId);if(value<state.lastObservedAt||day<state.day)throw Error('SELLER_CLOCK_UNCONFIRMED');}
  return {value,day,state};
 }
 return {
  async usedToday(){const {day,state}=await read();return state?.day===day?state.operations.length:0;},
  async reserve(operationId){if(!sellerUuid.test(operationId??''))throw Error('OPERATION_ID_REQUIRED');const release=await store.acquireLock('seller.execution-budget');
   try{const {value,day,state}=await read();if(state?.day===day&&state.operations.includes(operationId))return;
    const next={version:1,ownerId,day,lastObservedAt:value,operations:state?.day===day?[...state.operations]:[]};if(next.operations.length>=SELLER_DAILY_EXECUTIONS)throw Error('SELLER_DAILY_EXECUTIONS_EXHAUSTED');next.operations.push(operationId);
    if(state)await journal.append(next);else await journal.initialize(next);
   }finally{await release();}
  }
 };
}
/** Save the exact report before MCP. Recover a ready intention only after
 * rechecking health. A stop supersedes uncertain readiness with a new false
 * observation; it must never briefly activate a stale ready intention. */
export function createSellerCapacityReporter({store,configuration:config,transport,adapter,budget,now=Date.now}){
 if(!store?.journal||!store?.acquireLock||!config?.ownerId||!config?.cardHash||!transport?.callTool||typeof budget?.usedToday!=='function')throw Error('SELLER_CAPACITY_CONFIGURATION_REQUIRED');
 const journal=store.journal('seller.capacity.'+config.card.id),bindingHash=sellerHash(sellerCanonical({ownerId:config.ownerId,agentId:config.agentId,serviceId:config.card.id,cardHash:config.cardHash}));
 async function read(){const packet=await readSellerJournal(journal);if(packet&&(packet.version!==1||packet.bindingHash!==bindingHash||!['prepared','confirmed'].includes(packet.phase)||!sellerUuid.test(packet.report?.reportId??'')||packet.report.serviceId!==config.card.id||packet.report.cardHash!==config.cardHash))throw Error('SELLER_CAPACITY_STATE_UNCONFIRMED');return packet;}
 async function send(packet){const body=await sellerTool(transport,'report_market_capacity',packet.report),capacity=body.capacity;
  // The response reports effective availability: a paid pending order makes
  // it false even when this ready observation was accepted successfully.
  // The native acknowledgement exposes no account identifiers or full report.
  // Its saved report UUID binds it to this authenticated request and service.
  if(!capacity||capacity.reportId!==packet.report.reportId||typeof capacity.ready!=='boolean'||!packet.report.ready&&capacity.ready||!Number.isFinite(Date.parse(capacity.receivedAt))||Date.parse(capacity.leaseExpiresAt)!==Date.parse(capacity.receivedAt)+360000||capacity.pendingLimit!==1||capacity.dailyLimit!==SELLER_DAILY_EXECUTIONS)throw Error('SELLER_CAPACITY_ACK_UNCONFIRMED');
  await journal.append({...packet,phase:'confirmed',capacity});return capacity;
 }
 async function report({ready=true}={}){let prior=await read();if(prior?.phase==='prepared'&&!prior.report.ready)return send(prior);
  let health={ready:false};if(ready){if(typeof adapter?.availability!=='function')throw Error('PROVIDER_AVAILABILITY_REQUIRED');try{health=await adapter.availability();}catch(error){if(error.httpStatus===429)throw error;health={ready:false};}}
  const observed=clock(now);if(prior&&observed<Date.parse(prior.report.observedAt))throw Error('SELLER_CLOCK_UNCONFIRMED');
  const usedToday=Math.max(await budget.usedToday(),Number.isInteger(health.usedToday)?health.usedToday:0);if(usedToday>SELLER_DAILY_EXECUTIONS)throw Error('SELLER_DAILY_STATE_UNCONFIRMED');
  const available=ready&&health.ready===true&&usedToday<SELLER_DAILY_EXECUTIONS;
  if(prior?.phase==='prepared'&&available&&prior.report.day===dayAt(observed)&&usedToday<=prior.report.usedToday)return send(prior);
  const report={serviceId:config.card.id,cardHash:config.cardHash,reportId:randomUUID(),ready:available,day:dayAt(observed),usedToday,observedAt:new Date(Math.max(observed,prior?Date.parse(prior.report.observedAt)+1:observed)).toISOString()};
  const packet={version:1,bindingHash,phase:'prepared',report};if(prior)await journal.append(packet);else await journal.initialize(packet);return send(packet);
 }
 async function locked(action){const release=await store.acquireLock('seller.capacity.'+config.card.id);try{return await action();}finally{await release();}}
 return {report:options=>locked(()=>report(options)),stop:()=>locked(()=>report({ready:false}))};
}
