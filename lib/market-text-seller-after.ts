import {after} from 'next/server.js';
import type {MarketOrder} from './marketplace-store.ts';
import {dispatchMarketTextWake} from './market-text-seller-runtime.ts';
/** after() is an opportunistic wake, not the durable queue. The original outbox
 * was committed with the paid order. Authenticated reads and guardian recover. */
export function scheduleMarketTextWake(order:MarketOrder){
 if(order.executionMode!=='on-demand'||!order.textWake||!['paid','executing'].includes(order.phase))return;
 try{after(async()=>{try{await dispatchMarketTextWake(order.operationId);}catch{/* Durable pending notice remains. */}});}catch{/* Outside an HTTP lifecycle, guardian still owns recovery. */}
}
