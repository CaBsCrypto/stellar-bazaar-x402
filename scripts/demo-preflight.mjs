// Read-only: emits boolean configuration checks, never credential values.
import {execFileSync} from 'node:child_process';
import {demoConfiguration} from '../lib/demo-configuration.ts';
import {MCP_TOOLS,MCP_VERSION} from '../lib/mcp-tool-contract.ts';
console.log(JSON.stringify({candidate:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),mcpVersion:MCP_VERSION,tools:MCP_TOOLS,...demoConfiguration(),externalChecks:'Read-only configuration checks do not test storage, external availability or a payment. Paired preview/production namespace evidence, Upstash quota, deployed tools/list and acceptance remain required.'},null,2));
