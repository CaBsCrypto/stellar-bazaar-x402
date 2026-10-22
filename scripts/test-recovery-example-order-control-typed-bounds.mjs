import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {orderControlTypedBounds} from './recovery-example-order-control-typed-bounds.mjs';
const report=orderControlTypedBounds(),MiB=1048576;let checks=0;
assert.equal(report.paths.orderRead.rest,11);assert.equal(report.paths.orderRead.commands,44);checks+=2;
assert.equal(report.paths.orderClaim.rest,16);assert.equal(report.paths.orderClaim.commands,66);checks+=2;
assert.equal(report.paths.orderDeliveryOrFailure.rest,17);assert.equal(report.paths.orderDeliveryOrFailure.commands,70);checks+=2;
assert.ok(report.paths.orderRead.combined<20*MiB);assert.ok(report.paths.orderClaim.combined<28*MiB);assert.ok(report.paths.orderDeliveryOrFailure.combined<28*MiB);checks+=3;
const workspace=await readFile(new URL('../lib/workspace-store.ts',import.meta.url),'utf8'),route=await readFile(new URL('../app/api/mcp/route.ts',import.meta.url),'utf8'),market=await readFile(new URL('../lib/marketplace.ts',import.meta.url),'utf8');
assert.ok(workspace.includes("const attempts=continuousWorkspaceMode()||"));assert.ok(workspace.includes("const attempts = continuousWorkspaceMode() ||"));checks+=2;
const observed=/const queryTools=new Set\(\[([^\]]+)\]\)/.exec(route)?.[1];assert.ok(observed);for(const tool of ['get_market_order','claim_market_order','deliver_market_order','list_market_orders']){assert.equal(observed.includes("'"+tool+"'"),false);checks++;}
assert.ok(market.includes("['deliver','fail'].includes(action.action)?await configuredMarketStore().transact"));assert.ok(market.includes("const commitGuard=snapshot?"));checks+=2;
console.log(JSON.stringify({status:'PASS_ANALYTICAL_NATIVE_ORDER_CONTROL_CAPS',checks,paths:report.paths,networkRequests:0,redisCommands:0,payments:0,sourceBranchAssumptions:report.sourceBranchAssumptions}));
