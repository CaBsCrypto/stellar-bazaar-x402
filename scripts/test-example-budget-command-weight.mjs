import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {captureExampleBudgetCommandCatalog} from './prepare-example-budget-command-catalog.mjs';
import {exampleBudgetCommandWeight,EXAMPLE_BUDGET_SCRIPT_CATALOG} from '../lib/example-budget-command-weight.ts';
const captured=await captureExampleBudgetCommandCatalog();let checks=0;
assert.deepEqual(captured.rows,EXAMPLE_BUDGET_SCRIPT_CATALOG);checks++;
assert.ok(Object.isFrozen(EXAMPLE_BUDGET_SCRIPT_CATALOG)&&EXAMPLE_BUDGET_SCRIPT_CATALOG.every(Object.isFrozen));checks++;
const command=fixture=>['eval',fixture.script,fixture.keyCount,...Array.from({length:fixture.keyCount},(_,index)=>'bazaar-workspace:pilot-'+'a'.repeat(32)+':fixture-'+index),...Array.from({length:fixture.argCount},()=>'{"fixture":true}')];
for(const fixture of captured.localScriptFixtures){
 const body=command(fixture);assert.equal(exampleBudgetCommandWeight(body),fixture.maximumRedisCommands);checks++;
 const stringCount=[...body];stringCount[2]=String(stringCount[2]);assert.equal(exampleBudgetCommandWeight(stringCount),fixture.maximumRedisCommands);checks++;
 for(const script of [fixture.script+' ',fixture.script+"\nfor i=1,1000 do redis.call('GET',KEYS[1]) end",fixture.script.replace('redis.call','redis.pcall')]){assert.throws(()=>exampleBudgetCommandWeight([...body.slice(0,1),script,...body.slice(2)]),{code:'EXAMPLE_TEXT_REDIS_SCRIPT_UNREVIEWED'});checks++;}
 for(const patch of [value=>value.pop(),value=>value.push('unexpected'),value=>value[2]=0,value=>value[2]=9,value=>value[3]='x'.repeat(513),value=>value[3]=null,value=>value[2]=NaN]){const value=[...body];patch(value);assert.throws(()=>exampleBudgetCommandWeight(value),{code:'EXAMPLE_TEXT_REDIS_SCRIPT_UNREVIEWED'});checks++;}
}
assert.equal(exampleBudgetCommandWeight(['GET','x'.repeat(512)]),1);checks++;
for(const body of [['get','x'.repeat(513)],['get',''],['get','valid','extra'],['set','valid','value'],['del','valid'],['mget','valid'],[['get','valid']],{},null,['eval',"-- continuous-free-command-reservations-v1\nreturn redis.call('GET',KEYS[1])",1,'valid','{}','{}'],['eval',"-- bazaar-market-capacity-cas-v1\nfor i=1,1000 do redis.call('GET',KEYS[1]) end",1,'valid']]){assert.throws(()=>exampleBudgetCommandWeight(body),{code:'EXAMPLE_TEXT_REDIS_SCRIPT_UNREVIEWED'});checks++;}
const fixtureHash=createHash('sha256').update(JSON.stringify(captured.rows)).digest('hex');
console.log(JSON.stringify({status:'PASS_LOCAL_EXACT_NATIVE_COMMAND_WEIGHTS',checks,scripts:captured.rows.length,catalogSha256:fixtureHash,maximumScriptCommands:17,includesEvalCommand:true,noRedisCallInsideReviewedLoops:true,unknownScriptOrArityRejected:true,networkRequests:0,ledgerWrites:0,payments:0,productionChanged:false}));
