import assert from 'node:assert/strict';
import {Asset,Keypair,Networks} from '@stellar/stellar-sdk';
import {createProvisioner,issuer} from './provision-usdc-sale-wallets.mjs';

async function check(other,expected,{otherTime=0}={}){
 const wallets=[Keypair.random(),Keypair.random()].map(key=>({publicKey:key.publicKey()}));
 const manifest={planId:'public-budget-double',participants:wallets.map(value=>({wallet:value.publicKey})),config:{identity:{network:'stellar:testnet',code:'USDC',issuer,sacContract:new Asset('USDC',issuer).contractId(Networks.TESTNET)}},readiness:{canInspectProvisioning:true},limits:{apiRequests:120,horizonReads:24,friendbotClaims:2,trustlineSubmissions:2,faucetApiRequests:2,outboundPayloadBytes:16777216,inboundPayloadBytes:33554432,activeExecutionSeconds:300}};
 const report={status:'IN_PROGRESS',counts:{horizonReads:0,friendbotClaims:0,trustlineSubmissions:0,faucetApiRequests:0,usdcFaucetClaims:0},attempts:[],outboundPayloadBytes:0,inboundPayloadBytes:0};let requests=0;
 const runner=createProvisioner({manifest,packet:{sale:{planId:manifest.planId,wallets}},report,otherBudget:async()=>other,otherActiveExecutionMs:async()=>otherTime,persistPacket:async()=>{},persistReport:async()=>{},fetcher:async()=>{requests++;throw Error('NETWORK_MUST_NOT_BE_REACHED');}});
 await assert.rejects(runner.inspect(),expected);assert.equal(requests,0);assert.equal(report.attempts.length,0);assert.equal(report.counts.horizonReads,0);
}
const none={apiRequests:0,outboundPayloadBytes:0,inboundPayloadBytes:0};
await check({...none,apiRequests:120},/COMBINED_API_REQUEST_LIMIT/);
await check({...none,outboundPayloadBytes:16777217},/COMBINED_OUTBOUND_PAYLOAD_LIMIT/);
await check({...none,inboundPayloadBytes:33554432-1048576+1},/COMBINED_INBOUND_PAYLOAD_LIMIT/);
await check(none,/COMBINED_EXECUTION_TIME_LIMIT/,{otherTime:288001});
await check({...none,apiRequests:NaN},/OTHER_BUDGET_EVIDENCE_INVALID/);
console.log(JSON.stringify({status:'PASS',aggregateCapsBeforeRequest:true,reservedResponseBytes:1048576,reservedTimeMs:12000,networkRequests:0,secretReads:0}));
