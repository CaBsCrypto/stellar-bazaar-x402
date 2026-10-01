import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const doc = process.argv[2];
const phase = process.argv[3] ?? 'journey';
const owner = 'C:/Users/MGC/AppData/Local/Temp/bazaar-sprint-handoff-owner-20261001';
const agent = 'C:/Users/MGC/AppData/Local/Temp/bazaar-sprint-handoff-agent-20261001';
const origin = 'http://127.0.0.1:3347';
const checkout = resolve('.');
const helper = 'examples/agent-workspace-mcp.mjs';
const keep = ['SystemRoot','SystemDrive','WINDIR','COMSPEC','PATH','PATHEXT','TEMP','TMP','APPDATA','LOCALAPPDATA','USERPROFILE','HOMEDRIVE','HOMEPATH','ProgramFiles','ProgramFiles(x86)','ProgramData','OS','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE'];
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => keep.includes(k)));
let commands = 0;
async function command(script, ...args) {
  commands++;
  const r = await exec(process.execPath, [script, ...args], { env, timeout: 30000, maxBuffer: 1024 * 1024 });
  const final = r.stdout.trim().split('\n').at(-1);
  assert.ok(final);
  return JSON.parse(final);
}
if (phase === 'journey') {
  const markdown = await readFile(doc, 'utf8');
  const blocks = new Map([...markdown.matchAll(/<!-- handoff-script:([^ ]+) -->\s*```js\r?\n([\s\S]*?)\r?\n```/g)].map((m) => [m[1], m[2]]));
  assert.equal(blocks.size, 2);
  await command(helper, 'prepare', owner, origin);
  const human = `${owner}/human-demo.mjs`;
  await writeFile(human, blocks.get('human-demo.mjs'), { flag: 'wx', mode: 0o600 });
  const intention = await command(human, 'prepare', checkout, owner);
  await command(helper, 'create', owner);
  await command(helper, 'create', owner);
  await command(human, 'delegate', checkout, owner, agent);
  const fixture = `${agent}/fixture-demo.mjs`;
  await writeFile(fixture, blocks.get('fixture-demo.mjs'), { flag: 'wx', mode: 0o600 });
  await command(human, 'send', checkout, owner);
  await command(human, 'send', checkout, owner);
  await command(helper, 'tasks', agent);
  await command(helper, 'claim', agent, intention.taskId);
  const first = await command(fixture, checkout, agent, intention.taskId);
  const conserved = await command(fixture, checkout, agent, intention.taskId);
  assert.equal(first.generated, true);
  assert.equal(conserved.generated, false);
  assert.equal(first.operationId, conserved.operationId);
  for (const mode of ['record', 'activity']) {
    const file = `${agent}/${mode === 'record' ? 'operation' : 'activity'}.json`;
    await command(helper, mode, agent, file);
    await command(helper, mode, agent, file);
  }
  await command(helper, 'respond', agent, intention.taskId, `${agent}/response.json`);
  await command(helper, 'respond', agent, intention.taskId, `${agent}/response.json`);
  await command(helper, 'recover', agent);
  const verified = await command(human, 'verify', checkout, owner);
  assert.equal(verified.sameConversationAndDelivery, true);
  console.log(JSON.stringify({ phase, commands, copiedScriptsWithoutModification: 2, humanMessages: verified.humanMessages, agentMessages: verified.agentMessages, operations: verified.operations, generatedResponses: 1, externalWrites: 0, valuesPrinted: false }));
} else if (phase === 'restart') {
  const verified = await command(`${owner}/human-demo.mjs`, 'verify', checkout, owner);
  assert.equal(verified.sameConversationAndDelivery, true);
  console.log(JSON.stringify({ phase, commands, byteEqualJSONRecords: true, humanMessages: verified.humanMessages, agentMessages: verified.agentMessages, operations: verified.operations, generatedResponses: 0, externalWrites: 0, valuesPrinted: false }));
} else throw new Error('unknown phase');
