import assert from 'node:assert/strict';
import {freeDemoWindow} from '../lib/free-demo-window.ts';
import {demoConfiguration} from '../lib/demo-configuration.ts';
const deadline='2026-10-12T21:00:00.000Z',end=Date.parse(deadline);
assert.deepEqual(freeDemoWindow({},end),{enabled:false,configured:true,admissionOpen:true,expiresAt:null});
const environment={BAZAAR_FREE_DEMO_ADMISSION_UNTIL:deadline};
assert.equal(freeDemoWindow(environment,end-1).admissionOpen,true);
assert.equal(freeDemoWindow(environment,end).admissionOpen,false);
assert.equal(freeDemoWindow(environment,end+1).admissionOpen,false);
assert.equal(freeDemoWindow(environment,end+86400000).expiresAt,deadline,'Reads never extend expiry');
for(const value of ['', '2026-02-30T00:00:00.000Z','2026-10-12T21:00:00Z','2026-10-12T21:00:00.000-03:00','secret-instead-of-a-date']){
 const result=freeDemoWindow({BAZAAR_FREE_DEMO_ADMISSION_UNTIL:value},end);
 assert.equal(result.configured,false);assert.equal(result.admissionOpen,false);assert.equal(result.expiresAt,null);
 if(value)assert.equal(JSON.stringify(result).includes(value),false);
}
for(const clock of [NaN,-1,Infinity,1.5])assert.equal(freeDemoWindow(environment,clock).admissionOpen,false);
const closed=demoConfiguration({BAZAAR_FREE_DEMO_ADMISSION_UNTIL:'2000-01-01T00:00:00.000Z',BAZAAR_ENABLE_MARKET_PURCHASES:'true',BAZAAR_ENABLE_SELF_LISTING_INTAKE:'true'});
assert.equal(closed.checks.newAdmissionsOpen,false);
assert.equal(closed.checks.providerIntakeEnabled,false);
assert.equal(closed.checks.purchasesEnabled,false);
assert.equal(closed.freeDemoWindow.admissionOpen,false);
console.log(JSON.stringify({status:'PASS',checks:['UTC deadline boundary','absent policy preserves existing operation','invalid deadline/clock closes admission','reads never extend expiry','effective configuration closes fresh registration, submission and purchases'],externalRequests:0,payments:0}));
