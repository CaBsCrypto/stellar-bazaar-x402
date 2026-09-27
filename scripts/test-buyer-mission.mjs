// Explicit local allowlist. No faucet, real wallet, provider, Redis, S3 or deployment.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const tests=[
 'test-webmcp-lifecycle','test-webmcp-native-lifecycle','test-webmcp-async-discovery','test-webmcp-conformance','test-webmcp-payment-options','test-webmcp-public-discovery','test-public-resource-render',
 'test-agent-chat-flow','test-history-provisioning','test-operation-history','test-operation-history-client','test-operation-history-ui','test-private-webmcp',
 'test-activity-panel','test-provider-self-listing','test-deliverables','test-deliverable-viewers','test-delivery-recovery-client','test-automatic-recovery',
 'test-xlm-pilot','test-testnet-transfer','test-shared-settlement-local',
 'test-buyer-instructions','test-buyer-mcp','test-buyer-acceptance','test-buyer-copy','test-publisher-brief','test-provider-card-preservation','test-review-proxies'
];
const git=args=>spawnSync('git',args,{encoding:'utf8'}).stdout.trim();
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|SystemRoot|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|NUMBER_OF_PROCESSORS)$/i.test(key)));
env.NODE_ENV='test';
const report={date:new Date().toISOString(),sha:git(['rev-parse','HEAD']),dirty:git(['status','--short']),runtime:process.version,environment:'Local doubles and loopback MCP only; allowlisted environment. No transfers or external storage.',results:[]};
for(const test of tests){const result=spawnSync(process.execPath,[`scripts/${test}.mjs`],{env,encoding:'utf8',timeout:180000});report.results.push({command:`node scripts/${test}.mjs`,exitCode:result.status,output:(result.stdout+result.stderr).trim()});console.log(`${result.status===0?'PASS':'FAIL'} ${test}`);}
writeFileSync('docs/buyer-mission-results.json',JSON.stringify(report,null,2)+'\n');
if(report.results.some(result=>result.exitCode!==0))process.exitCode=1;
