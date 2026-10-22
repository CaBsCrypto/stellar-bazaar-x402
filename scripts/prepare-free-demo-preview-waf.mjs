// Pure, narrow WAF subtraction. No cloud client or private file reads.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { matchesWafGroups, sourceRuleId, baselineConfigurationSha256 } from './prepare-continuous-production-waf-proposal.mjs';
export const FREE_PREVIEW_HOST = 'stellar-bazaar-x402-gwbzxq0qm-cabscryptocontacto-6028s-projects.vercel.app';
export const FREE_PREVIEW_DEPLOYMENT = 'dpl_HzjAcj18YkQBgXfWwtUgvmATH6ui';
export const FREE_PREVIEW_SOURCE = '265a9babe5aa64942add49b6b2acd757463d2d8a65b45c9ea300c20c28aca124';
export const FREE_WAF_BASELINE_CANONICAL = '9890691faf212404f104a0781f528aa9239b623b90d8c718226ea9e7a6e6ee16';
const fail = code => { throw Error(code); }, sha = b => createHash('sha256').update(b).digest('hex');
const c = (type, op, value, neg = false) => ({ type, op, value, ...(neg ? { neg: true } : {}) });
export const FREE_PREVIEW_EXCEPTION = Object.freeze({ conditions: [c('host','eq',FREE_PREVIEW_HOST), c('environment','eq','preview'), c('path','eq','/api/mcp'), c('method','inc',['GET','POST'])] });
function matchesCondition(condition, value) { return matchesWafGroups([{ conditions: [condition] }], { [condition.type]: value }); }
function impossible(conditions) {
  for (const type of ['host','environment','path','method','ip_address']) {
    const constraints = conditions.filter(condition => condition.type === type), finite = constraints.find(condition => !condition.neg && ['eq','inc'].includes(condition.op));
    if (finite && !(finite.op === 'eq' ? [finite.value] : finite.value).some(value => constraints.every(condition => matchesCondition(condition, value)))) return true;
  }
  return false;
}
export function buildFreePreviewWafRule(rule, baselineSha = baselineConfigurationSha256) {
  if (baselineSha !== baselineConfigurationSha256 || rule?.id !== sourceRuleId || rule.active !== true || rule.action?.mitigate?.action !== 'deny' || rule.conditionGroup?.length !== 12) fail('EXACT_FREE_PREVIEW_WAF_BASELINE_REQUIRED');
  for (const group of rule.conditionGroup) for (const condition of group.conditions ?? []) if (!['ip_address','host','environment','method','path'].includes(condition.type) || !['eq','inc','re'].includes(condition.op) || condition.neg !== undefined && typeof condition.neg !== 'boolean' || condition.op === 'inc' && (!Array.isArray(condition.value) || condition.value.some(value => typeof value !== 'string')) || condition.op !== 'inc' && typeof condition.value !== 'string') fail('KNOWN_FREE_PREVIEW_WAF_CONDITIONS_REQUIRED');
  const denyException = FREE_PREVIEW_EXCEPTION.conditions.map(condition => ({ ...structuredClone(condition), neg: true }));
  const groups = [];
  for (const group of rule.conditionGroup) {
    const overlaps = ['GET','POST'].some(method => group.conditions.filter(condition => condition.type !== 'ip_address').every(condition => matchesCondition(condition, { host: FREE_PREVIEW_HOST, environment:'preview', path:'/api/mcp', method }[condition.type])));
    if (!overlaps) { groups.push(structuredClone(group)); continue; }
    for (const denial of denyException) { const conditions = [...structuredClone(group.conditions), structuredClone(denial)]; if (!impossible(conditions)) groups.push({ ...structuredClone(group), conditions }); }
  }
  if (groups.length !== 18 || groups.length > 25 || groups.some(group => group.conditions.length > 65)) fail('BOUNDED_FREE_PREVIEW_RULE_REQUIRED');
  return { ...structuredClone(rule), conditionGroup: groups };
}
export function freePreviewWafProposal(snapshot, receipt) {
  if (snapshot?.status !== 'READ_ONLY_CURRENT_WAF_BASELINE' || snapshot.configurationSha256 !== baselineConfigurationSha256 || snapshot.canonicalConfigurationSha256 !== FREE_WAF_BASELINE_CANONICAL || receipt?.deploymentId !== FREE_PREVIEW_DEPLOYMENT || receipt.sourceDigest !== FREE_PREVIEW_SOURCE || receipt.target !== 'preview' || receipt.readyState !== 'READY' || receipt.url !== 'https://' + FREE_PREVIEW_HOST || receipt.purchasesEnabled !== false || receipt.filesEnabled !== false || receipt.crons?.length !== 0) fail('EXACT_READY_FREE_PREVIEW_AND_BASELINE_REQUIRED');
  const rule = buildFreePreviewWafRule(snapshot.sourceRule);
  return { version:1, status:'PREPARED_NOT_APPLIED', remoteApplied:false, approved:false, projectId:'prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3', sourceRuleId, baselineConfigurationSha256, baselineCanonicalConfigurationSha256:FREE_WAF_BASELINE_CANONICAL, deploymentId:FREE_PREVIEW_DEPLOYMENT, hostname:FREE_PREVIEW_HOST, sourceDigest:FREE_PREVIEW_SOURCE, exactException:FREE_PREVIEW_EXCEPTION, predicate:'proposedDeny = baselineDeny AND NOT (host=gwbzxq0qm AND environment=preview AND path=/api/mcp AND method IN GET,POST)', groupsBefore:12, groupsAfter:rule.conditionGroup.length, officialMaximumGroups:25, sanitizedRule:rule, operatorIpPlaceholderNotApplicable:true, preserve:{operatorIps:true,otherRules:true,allOriginalHostLists:true,allExistingExceptions:true,productionBehavior:true,vercelDeploymentProtection:true,agentAuthorization:true,purchasesClosed:true,filesClosed:true,noCron:true}, deploymentProtectionStatus:'independent project protection confirmed by deployment controller; proposed WAF change still requires validation', causeStatus:'baseline predicate is consistent with observed403; fresh configuration and postchange request validation are pending', requiresBeforeApply:['fresh full raw and canonical baseline hashes match','no unrelated draft changes','explicit approval of this exact Preview exception','one rules.update draft; validate/readback exact protection hash','one activation after fresh baseline/draft recheck; unknown result uses GET recovery'], productionChanged:false, payments:0 };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { if (process.argv.length !== 2) fail('LOCAL_WAF_PROPOSAL_ARGUMENTS_FORBIDDEN'); const snapshot=JSON.parse(await readFile('docs/evidence/continuous-waf-baseline-2026-10-11.json','utf8')), receipt=JSON.parse(await readFile('docs/evidence/free-demo-bazaar-preview-deployment-2026-10-11.json','utf8'));const proposal=freePreviewWafProposal(snapshot,receipt), bytes=JSON.stringify(proposal,null,2)+'\n'; await writeFile('docs/release/free-demo-preview-waf-proposal-2026-10-11.json',bytes,{flag:'wx'});console.log(JSON.stringify({status:proposal.status,proposalSha256:sha(bytes),groups:proposal.groupsAfter,remoteApplied:false,productionChanged:false})); }
  catch(error){console.error(JSON.stringify({status:'UNCONFIRMED',code:/^[A-Z][A-Z0-9_]+$/.test(error?.message??'')?error.message:'FREE_PREVIEW_WAF_PROPOSAL_UNCONFIRMED',remoteApplied:false}));process.exitCode=1;}
}
