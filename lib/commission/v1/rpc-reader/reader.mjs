/** Server-only, disabled candidate. No default fetch, credentials, writes, polls or retries. */
import { createHash } from 'node:crypto';
import {decodeSuccessfulEnvelope} from '../channels-adapter/ledger-envelope.mjs';
import { Address, Networks, StrKey, TransactionBuilder, xdr } from '@stellar/stellar-sdk';

export const TESTNET_RPC = 'https://soroban-testnet.stellar.org/';
export const PROFILE = 'bazaar-split-exact-v1';
export const MAX_RESPONSE_BYTES = 524288;
const MAX_REQUEST_BYTES = 4096;
const MAX_WASM_BYTES = 65536;
const HEX = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const METHODS = { 'getTransaction': 'rpc:transaction', 'getLatestLedger': 'rpc:latest-ledger', 'getLedgerEntries': 'rpc:router-pin' };
const SCOPES = [...Object.values(METHODS), 'rpc:recovery'];
const SCOPE_FIELDS = ['expiresAtMs', 'operationId', 'packetHash', 'policyHash', 'profile', 'router', 'routerCodeHash', 'scopes', 'transactionHash', 'version'].sort();
const need = (ok, code) => { if (!ok) throw Error(code); };
const sha = value => createHash('sha256').update(value).digest('hex');
const uint = value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
const hash = value => typeof value === 'string' && HEX.test(value);

function scopeValid(scope, nowMs) {
  need(scope && Object.keys(scope).sort().join('|') === SCOPE_FIELDS.join('|') &&
    scope.version === 'bazaar.rpc-read-authorization/v1' && scope.profile === PROFILE, 'RPC_SCOPE_INVALID');
  need(typeof scope.operationId === 'string' && UUID.test(scope.operationId) &&
    !['31c97193-be74-4b9d-b0a3-f3890b0a41e8', 'ed6c4530-e76f-49e0-8f39-5ec8578820e2'].includes(scope.operationId), 'RPC_OPERATION_EXCLUDED');
  need([scope.policyHash, scope.packetHash, scope.routerCodeHash].every(hash) &&
    typeof scope.router === 'string' && StrKey.isValidContract(scope.router) &&
    (scope.transactionHash === null || hash(scope.transactionHash)), 'RPC_BINDING_INVALID');
  need(Array.isArray(scope.scopes) && scope.scopes.length >= 1 && scope.scopes.length <= SCOPES.length &&
    new Set(scope.scopes).size === scope.scopes.length && scope.scopes.every(value => SCOPES.includes(value)), 'RPC_SCOPES_INVALID');
  need(Number.isSafeInteger(nowMs) && nowMs > 0 && Number.isSafeInteger(scope.expiresAtMs) &&
    scope.expiresAtMs > nowMs && scope.expiresAtMs <= nowMs + 300000, 'RPC_SCOPE_EXPIRED');
}

function parseXdr(value, kind, maximumBytes) {
  need(typeof value === 'string' && value.length > 0 && value.length <= Math.ceil(maximumBytes / 3) * 4 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value), 'RPC_XDR_INVALID');
  let parsed;
  try { parsed = kind.fromXDR(value, 'base64'); } catch { throw Error('RPC_XDR_INVALID'); }
  need(parsed.toXDR('base64') === value, 'RPC_XDR_NONCANONICAL');
  return parsed;
}

function abortBounded(promise, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(Error('RPC_TIMEOUT')); return; }
    const aborted = () => reject(Error('RPC_TIMEOUT'));
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(promise).then(value => { signal.removeEventListener('abort', aborted); resolve(value); },
      () => { signal.removeEventListener('abort', aborted); reject(Error('RPC_TRANSPORT_FAILED')); });
  });
}

async function readBounded(response, signal) {
  need(response && response.ok === true && response.redirected !== true &&
    (!response.url || response.url === TESTNET_RPC) && response.body, 'RPC_HTTP_REJECTED');
  let headerBytes = 0;
  for (const [key, value] of response.headers) headerBytes += Buffer.byteLength(key + ': ' + value + '\r\n');
  need(headerBytes <= 16384, 'RPC_RESPONSE_HEADERS_BOUND');
  const contentType = response.headers.get('content-type')?.split(';')[0].trim();
  need(contentType === 'application/json', 'RPC_CONTENT_TYPE_INVALID');
  const declared = response.headers.get('content-length');
  if (declared !== null) need(/^[0-9]+$/.test(declared) && Number(declared) <= MAX_RESPONSE_BYTES, 'RPC_RESPONSE_BOUND');
  const reader = response.body.getReader(), parts = [];
  let bytes = headerBytes;
  try {
    for (;;) {
      const item = await abortBounded(reader.read(), signal);
      if (item.done) break;
      need(item.value instanceof Uint8Array, 'RPC_RESPONSE_INVALID');
      bytes += item.value.byteLength;
      need(bytes <= MAX_RESPONSE_BYTES, 'RPC_RESPONSE_BOUND');
      parts.push(Buffer.from(item.value));
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    try { reader.releaseLock(); } catch { /* abort/cancel may still be completing */ }
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw Error('RPC_JSON_INVALID'); }
}

export function routerLedgerKeys(router, routerCodeHash) {
  need(typeof router === 'string' && StrKey.isValidContract(router) && hash(routerCodeHash), 'RPC_ROUTER_PIN_INVALID');
  return [
    xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(router).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent() })).toXDR('base64'),
    xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(routerCodeHash, 'hex') })).toXDR('base64'),
  ];
}

/** Pure shared decoder; no network or admission authority. */
export function decodePinnedRouterEntries(result, pins) {
  const keys = routerLedgerKeys(pins.router, pins.routerCodeHash);
      need(uint(result.latestLedger) && result.latestLedger > 0 && Array.isArray(result.entries) && result.entries.length === 2,
        'RPC_ROUTER_ENTRIES_MISSING');
      const entries = new Map();
      for (const entry of result.entries) {
        need(entry && typeof entry.key === 'string' && keys.includes(entry.key) && !entries.has(entry.key) &&
          uint(entry.lastModifiedLedgerSeq) && entry.lastModifiedLedgerSeq <= result.latestLedger &&
          uint(entry.liveUntilLedgerSeq) && entry.liveUntilLedgerSeq >= result.latestLedger, 'RPC_ROUTER_ENTRY_INVALID_OR_ARCHIVED');
        parseXdr(entry.key, xdr.LedgerKey, 512);
        entries.set(entry.key, parseXdr(entry.xdr, xdr.LedgerEntryData, MAX_WASM_BYTES + 4096));
      }
      const instance = entries.get(keys[0]);
      need(instance?.switch().name === 'contractData', 'RPC_ROUTER_INSTANCE_MISMATCH');
      const data = instance.contractData();
      need(Address.fromScAddress(data.contract()).toString() === pins.router &&
        data.key().switch().name === 'scvLedgerKeyContractInstance' && data.durability().name === 'persistent' &&
        data.val().switch().name === 'scvContractInstance', 'RPC_ROUTER_INSTANCE_MISMATCH');
      const executable = data.val().instance().executable();
      need(executable.switch().name === 'contractExecutableWasm' &&
        executable.wasmHash().toString('hex') === pins.routerCodeHash, 'RPC_ROUTER_EXECUTABLE_MISMATCH');
      const codeEntry = entries.get(keys[1]);
      need(codeEntry?.switch().name === 'contractCode', 'RPC_ROUTER_CODE_MISMATCH');
      const code = codeEntry.contractCode();
      need(code.hash().toString('hex') === pins.routerCodeHash && code.code().length > 0 &&
        code.code().length <= MAX_WASM_BYTES && sha(code.code()) === pins.routerCodeHash, 'RPC_ROUTER_CODE_MISMATCH');
      const bytes = code.code();
      need(bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0,97,115,109,1,0,0,0])), 'RPC_ROUTER_WASM_INVALID');
      return { network: 'stellar:testnet', router: pins.router, routerCodeHash: pins.routerCodeHash,
        codeBytes: bytes.length, ledger: result.latestLedger, instanceAndCodeRead: true, wasmBytesHashVerified: true,
        trustedRpcEndpoint: TESTNET_RPC, consensusProofVerified: false };
}
export function createTestnetRpcReader({ enabled = false, fetcher, admit, scope, now = Date.now, timeoutMs = 10000 } = {}) {
  const frozenScope = scope === undefined ? undefined : structuredClone(scope);
  function authorized(method) {
    need(enabled === true, 'RPC_READER_DISABLED');
    need(typeof fetcher === 'function' && typeof admit === 'function' && typeof now === 'function' &&
      Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 10000, 'RPC_READER_NOT_CONFIGURED');
    scopeValid(frozenScope, now());
    need(frozenScope.scopes.includes(METHODS[method]), 'RPC_SCOPE_FORBIDDEN');
  }
  async function request(method, params) {
    authorized(method);
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const outboundBytes = Buffer.byteLength(body) + 256;
    need(outboundBytes <= MAX_REQUEST_BYTES, 'RPC_REQUEST_BOUND');
    need(await admit({ endpoint: TESTNET_RPC, method: 'POST', rpcMethod: method, maximumAttempts: 1,
      outboundBytes, maximumInboundBytes: MAX_RESPONSE_BYTES, timeoutMs,
      binding: { operationId: frozenScope.operationId, policyHash: frozenScope.policyHash,
        packetHash: frozenScope.packetHash, transactionHash: frozenScope.transactionHash } }) === true, 'RPC_BUDGET_NOT_ADMITTED');
    authorized(method); // admission may have waited; expiry is rechecked before dispatch.
    const signal = AbortSignal.timeout(timeoutMs);
    let response;
    try {
      response = await abortBounded(fetcher(TESTNET_RPC, { method: 'POST', body,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        redirect: 'error', credentials: 'omit', cache: 'no-store', signal }), signal);
    } catch { throw Error('RPC_TRANSPORT_FAILED'); }
    const json = await readBounded(response, signal);
    need(json && !Array.isArray(json) && json.jsonrpc === '2.0' && json.id === 1 &&
      !Object.hasOwn(json, 'error') && json.result && typeof json.result === 'object' && !Array.isArray(json.result), 'RPC_RESPONSE_INVALID');
    return json.result;
  }
  async function transaction(transactionHash) {
    authorized('getTransaction');
    need(hash(transactionHash) && transactionHash === frozenScope.transactionHash, 'RPC_TRANSACTION_OUTSIDE_SCOPE');
    const result = await request('getTransaction', { hash: transactionHash, xdrFormat: 'base64' });
    need(result.txHash === transactionHash && uint(result.latestLedger) && result.latestLedger > 0 &&
      ['SUCCESS', 'NOT_FOUND', 'FAILED'].includes(result.status), 'RPC_TRANSACTION_INVALID');
    if (result.status !== 'SUCCESS') {
      return { network: 'stellar:testnet', status: result.status, transactionHash,
        latestLedger: result.latestLedger, outcome: result.status === 'NOT_FOUND' ? 'unresolved-or-outside-retention' : 'failed',
        pending: result.status === 'NOT_FOUND', canResubmit: false, readOnly: true };
    }
    need(uint(result.ledger) && result.ledger > 0 && result.ledger <= result.latestLedger, 'RPC_TRANSACTION_LEDGER_INVALID');
    parseXdr(result.envelopeXdr, xdr.TransactionEnvelope, 65536);
    let envelope;
    try { envelope = TransactionBuilder.fromXDR(result.envelopeXdr, Networks.TESTNET); } catch { throw Error('RPC_ENVELOPE_INVALID'); }
    need(envelope.hash().toString('hex') === transactionHash, 'RPC_TRANSACTION_HASH_MISMATCH');
    decodeSuccessfulEnvelope(result.envelopeXdr,result.resultXdr,transactionHash);
    parseXdr(result.resultMetaXdr, xdr.TransactionMeta, 131072);
    return { network: 'stellar:testnet', status: 'SUCCESS', transactionHash, ledger: result.ledger,
      envelopeXdr: result.envelopeXdr, resultXdr: result.resultXdr, resultMetaXdr: result.resultMetaXdr };
  }
  return Object.freeze({
    transaction,
    async getLatestLedger() {
      const result = await request('getLatestLedger', {});
      need(hash(result.id) && uint(result.sequence) && result.sequence > 0 &&
        uint(result.protocolVersion) && result.protocolVersion > 0, 'RPC_LATEST_LEDGER_INVALID');
      return { network: 'stellar:testnet', id: result.id, sequence: result.sequence, protocolVersion: result.protocolVersion };
    },
    async pinRouter() {
      authorized('getLedgerEntries');
      const keys = routerLedgerKeys(frozenScope.router, frozenScope.routerCodeHash);
      // Both entries are read in one bounded response at the same RPC latestLedger.
      const result = await request('getLedgerEntries', { keys, xdrFormat: 'base64' });
      return decodePinnedRouterEntries(result, frozenScope);
    },
    async recoverSameAttempt(binding) {
      authorized('getTransaction');
      need(frozenScope.scopes.includes('rpc:recovery') && binding &&
        Object.keys(binding).sort().join('|') === ['operationId','packetHash','policyHash','transactionHash'].sort().join('|') &&
        ['operationId','packetHash','policyHash','transactionHash'].every(key => binding[key] === frozenScope[key]), 'RPC_RECOVERY_OUTSIDE_SCOPE');
      return transaction(binding.transactionHash);
    },
  });
}

/** Adapter's narrower LedgerReader contract accepts successful evidence only. */
export function asAdapterLedgerReader(reader) {
  need(reader && typeof reader.transaction === 'function', 'RPC_READER_REQUIRED');
  return Object.freeze({ async transaction(transactionHash) {
    const evidence = await reader.transaction(transactionHash);
    need(evidence?.status === 'SUCCESS', 'RPC_TRANSACTION_NOT_CONFIRMED');
    return evidence;
  } });
}
