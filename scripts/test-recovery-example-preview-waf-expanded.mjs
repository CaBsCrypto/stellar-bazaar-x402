// Pure predicate and snapshot tests. The private baseline is read locally; its
// IP, conditions and raw configuration are never written to public evidence.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as controller from '../.vercel/recovery-example-preview-waf.mjs';
import {EXAMPLE_PREVIEW as P} from './recovery-example-preview-lib.mjs';
import {matchesWafGroups} from './prepare-continuous-production-waf-proposal.mjs';
import {v2WafRuleValue} from './prepare-on-demand-production-v3-waf.mjs';

const hash = value => createHash('sha256').update(value).digest('hex'), copy = structuredClone;
const baseline = JSON.parse(await readFile('.vercel/recovery-example-preview-baseline.json', 'utf8'));
const sourceBefore = hash(await readFile('.vercel/recovery-example-preview-waf.mjs'));
const deny = (configuration, request) => configuration.rules.some(rule => rule.active && rule.action?.mitigate?.action === 'deny' && matchesWafGroups(rule.conditionGroup, request));
let checks = 0;
const check = (value, message) => {assert.ok(value, message); checks++;};
const rejection = (fn, message) => {assert.throws(fn, message); checks++;};
const stageResults = [];
for (const stage of ['bazaar', 'provider']) {
  const old = baseline[stage + 'Waf'], oldHash = controller.protectionHash(old, stage), oldBytes = JSON.stringify(old);
  const plan = controller.examplePreviewWafPlan(old, stage);
  check(JSON.stringify(old) === oldBytes, 'baseline never mutated');
  check(plan.baselineHash === oldHash && plan.expectedHash !== oldHash, 'fresh and projected hashes distinct');
  check(plan.edits.length === (stage === 'bazaar' ? 2 : 1), 'exact two Bazaar rule updates or one provider update');
  const restored = copy(plan.expected);
  for (const edit of plan.edits) restored.rules = restored.rules.map(rule => rule.id === edit.id ? {...rule, ...copy(v2WafRuleValue(old.rules.find(original => original.id === edit.id)))} : rule);
  check(controller.protectionHash(restored, stage) === oldHash, 'restoring exact changed rules recovers baseline protection hash');
  const oldIps = old.rules.flatMap(rule => rule.conditionGroup.flatMap(group => group.conditions.filter(condition => condition.type === 'ip_address').map(condition => condition.value)));
  const operator = oldIps[0] ?? '192.0.2.1';
  const ordinary = operator === '192.0.2.2' ? '192.0.2.3' : '192.0.2.2';
  let publicChecks = 0;
  for (const environment of ['preview', 'production', 'development', '', 'PREVIEW']) for (const method of ['GET', 'POST', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'CONNECT']) for (const path of ['/api/mcp', '/api/mcp/', '/api/MCP', '/api/mcp/private', '/api/market/catalog', '/api/market/review', '/api/workspaces', '/api/market/guardian/tick', '/', '/unlisted']) {
    const request = {host: plan.host, environment, method, path, ip_address: ordinary};
    const expectedAllowed = environment.toLowerCase() === 'preview' && (stage === 'provider' || path.toLowerCase() === '/api/mcp' && ['GET', 'POST'].includes(method));
    check(deny(plan.expected, request) !== expectedAllowed, 'exact intended new Preview alias boundary'); publicChecks++;
  }
  for (const edit of plan.edits) {
    check(old.rules.some(rule => rule.id === edit.id), 'no inserted, removed or foreign rule');
    check(edit.active === true && edit.action?.mitigate?.action === 'deny', 'deny action remains active');
  }
  for (const mutate of [
    value => value.projectKey = 'foreign#active', value => value.rules = [], value => value.rules[0].conditionGroup = [], value => value.rules[0].id = 'foreign', value => value.rules.find(rule => rule.name?.includes('verified hosts only')).active = false,
    value => value.rules.find(rule => rule.name?.includes('verified hosts only')).conditionGroup[0].conditions[0].neg = false,
    value => value.rules.find(rule => rule.name?.includes('verified hosts only')).conditionGroup[0].conditions[0].value.push(plan.host),
  ]) {const value = copy(old); mutate(value); rejection(() => controller.examplePreviewWafPlan(value, stage));}
  for (const mutate of [value => value.crs = {...value.crs, unexpected: true}, value => value.ips = [{action: 'allow', ip: '192.0.2.55'}], value => value.rules[0].active = !value.rules[0].active]) {
    const value = copy(old); mutate(value); check(controller.protectionHash(value, stage) !== oldHash, 'changes to existing protections cannot retain fresh baseline hash');
  }
  stageResults.push({stage, predicateControlsFromPlan: plan.controls, additionalPublicControls: publicChecks, baselineHash: oldHash, expectedHash: plan.expectedHash, edits: plan.edits.length});
}
// Strict activation guards must be exported by the release controller. They
// validate actual API shapes without trusting a projection that omits changes.
for (const name of ['assertExampleEmptyWafDraft', 'assertExampleOwnedWafDraft', 'assertExampleFreshWaf']) check(typeof controller[name] === 'function', 'reviewed activation guard export: ' + name);
for (const stage of ['bazaar', 'provider']) {
  const old = baseline[stage + 'Waf'], plan = controller.examplePreviewWafPlan(old, stage);
  const empty = {active: copy(old), draft: null, versions: []};
  check(controller.assertExampleEmptyWafDraft(empty, stage) !== false, 'confirmed null draft accepted');
  const observedListing = JSON.parse(await readFile(`.vercel/recovery-example-${stage}-waf-listing.json`, 'utf8'));
  check(controller.assertExampleEmptyWafDraft(observedListing, stage) !== false, 'actual locally recorded listing shape accepted');
  const cleanDraft = {...copy(old), projectKey: P[stage + 'Project'] + '#draft', changes: []};
  check(controller.assertExampleEmptyWafDraft({...empty, draft: cleanDraft}, stage) !== false, 'confirmed empty typed draft accepted');
  for (const listing of [null, {}, [], {active: old, versions: []}, {...empty, draft: []}, {...empty, draft: {}}, {...empty, draft: {changes: {}}}, {...empty, draft: {...cleanDraft, changes: null}}, {...empty, draft: {...cleanDraft, changes: [{action: 'rules.remove', id: 'foreign'}]}}, {...empty, versions: null}]) rejection(() => controller.assertExampleEmptyWafDraft(listing, stage));
  const draft = {...copy(plan.expected), projectKey: P[stage + 'Project'] + '#draft', changes: plan.edits.map(edit => ({action: 'rules.update', id: edit.id}))};
  draft.rules = draft.rules.map(rule => ({...rule, valid: true, validationErrors: null}));
  check(controller.assertExampleOwnedWafDraft(draft, stage, plan.edits, plan.expectedHash) !== false, 'exact validated owned draft accepted');
  const echoed = copy(draft);
  echoed.changes = plan.edits.map(edit => ({action: 'rules.update', id: edit.id, value: copy(v2WafRuleValue(edit))}));
  check(controller.assertExampleOwnedWafDraft(echoed, stage, plan.edits, plan.expectedHash) !== false, 'matching explicit rule value echo accepted');
  echoed.changes[0].value.active = false;
  rejection(() => controller.assertExampleOwnedWafDraft(echoed, stage, plan.edits, plan.expectedHash));
  for (const mutate of [value => value.changes = [], value => value.changes = {}, value => value.changes.push({action: 'rules.remove', id: 'foreign'}), value => value.changes[0].id = 'foreign', value => value.changes[0].action = 'rules.insert', value => value.projectKey = P[stage + 'Project'] + '#active', value => value.rules[0].valid = false, value => value.rules[0].validationErrors = ['invalid'], value => value.ownerId = 'foreign', value => value.rules[0].active = false]) {
    const value = copy(draft); mutate(value); rejection(() => controller.assertExampleOwnedWafDraft(value, stage, plan.edits, plan.expectedHash));
  }
  check(controller.assertExampleFreshWaf(old, stage, plan.baselineHash) !== false, 'fresh active baseline accepted');
  check(controller.assertExampleFreshWaf(plan.expected, stage, plan.expectedHash) !== false, 'fresh exact applied state accepted for restoration');
  rejection(() => controller.assertExampleFreshWaf(old, stage, ''));
  rejection(() => controller.assertExampleFreshWaf(plan.expected, stage, plan.baselineHash));
  rejection(() => controller.assertExampleFreshWaf(old, stage, plan.expectedHash));
  for (const mutate of [value => value.firewallEnabled = false, value => value.ownerId = 'foreign', value => value.projectKey = P[stage + 'Project'] + '#draft', value => value.rules.push(copy(value.rules[0]))]) {
    const value = copy(old); mutate(value); rejection(() => controller.assertExampleFreshWaf(value, stage, plan.baselineHash));
  }
}
rejection(() => controller.examplePreviewWafPlan(baseline.bazaarWaf, 'foreign'));
check(hash(await readFile('.vercel/recovery-example-preview-waf.mjs')) === sourceBefore, 'test never edits the release controller');
const files = ['.vercel/recovery-example-preview-waf.mjs', 'scripts/test-recovery-example-preview-waf-expanded.mjs', 'scripts/prepare-on-demand-production-v3-waf.mjs', 'scripts/prepare-continuous-production-waf-proposal.mjs'];
const sources = Object.fromEntries(await Promise.all(files.map(async path => [path, hash(await readFile(path))])));
const evidence = {status: 'PASS_LOCAL_EXAMPLE_PREVIEW_WAF_PREDICATES_AND_GUARDS', observedAt: new Date().toISOString(), checks, stageResults, sourceHashes: sources, rawPrivateConfigurationReturned: false, networkRequests: 0, firewallMutations: 0, productionChanged: false, payments: 0};
if (process.argv[2] === '--write-evidence') await writeFile('docs/evidence/recovery-example-preview-waf-expanded-local-2026-10-12.json', JSON.stringify(evidence, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify(evidence));
