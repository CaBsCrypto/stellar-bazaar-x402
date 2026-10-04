import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {loadPacket} from './marketplace-private-packet.mjs';

const directory = 'docs/evidence/sprint-marketplace';
const readJson = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const requireValue = (condition, code) => { if (!condition) throw Error(code); };

async function main() {
  const role = process.argv[2];
  requireValue(process.argv.length === 3 && ['A', 'B'].includes(role), 'IDENTITY_A_OR_B_REQUIRED');
  const manifest = await readJson(directory + '/usdc-sale-manifest.json');
  const deployment = await readJson(directory + '/usdc-bazaar-current.json');
  requireValue(deployment.planId === manifest.planId, 'SALE_PLAN_MISMATCH');
  requireValue(deployment.sourceSha === manifest.sourceSha && /^[a-f0-9]{40}$/.test(deployment.sourceSha), 'SOURCE_SHA_MISMATCH');
  requireValue(deployment.payloadFingerprint === manifest.uploads?.bazaar?.payloadFingerprint && /^[a-f0-9]{64}$/.test(deployment.payloadFingerprint), 'PAYLOAD_FINGERPRINT_MISMATCH');
  requireValue(deployment.readyState === 'READY' && deployment.target === 'preview', 'READY_PREVIEW_REQUIRED');
  requireValue(deployment.protectionEnabled === true, 'PREVIEW_PROTECTION_REQUIRED');
  requireValue(/^dpl_[A-Za-z0-9]+$/.test(deployment.id), 'DEPLOYMENT_ID_REQUIRED');
  const target = new URL(deployment.url);
  requireValue(target.href === target.origin + '/', 'EXACT_PREVIEW_ORIGIN_REQUIRED');
  requireValue(/^https:\/\/stellar-bazaar-x402-[a-z0-9]+-cabscryptocontacto-6028s-projects\.vercel\.app$/.test(target.origin), 'AUTHORIZED_PREVIEW_REQUIRED');

  // Decryption and the access link stay in memory. No packet mutation or plaintext file.
  let packet = await loadPacket();
  requireValue(packet.planId === manifest.workspacePlanId && packet.sale?.planId === manifest.planId, 'PACKET_PLAN_MISMATCH');
  requireValue(packet.sale.completed?.includes('replacement'), 'SALE_REPLACEMENT_REQUIRED');
  requireValue(!packet.sale.completed.includes('retire'), 'SELLER_ALREADY_REVOKED');
  const index = role === 'A' ? 0 : 1;
  requireValue(packet.receipt?.[index]?.ownerId === manifest.participants?.[index]?.ownerId, 'OWNER_BINDING_MISMATCH');
  requireValue(packet.receipt[index].workspaceId === manifest.participants[index].workspaceId, 'WORKSPACE_BINDING_MISMATCH');
  const access = packet.identities?.[index]?.[role === 'A' ? 'rotatedHuman' : 'human'];
  requireValue(typeof access === 'string' && /^[A-Za-z0-9_-]{43}$/.test(access), 'HUMAN_ACCESS_REQUIRED');
  let recoveryLink = target.origin + '/history#token=' + encodeURIComponent(access);
  packet = undefined;

  const id = randomUUID();
  const path = '/recover/' + id;
  let served = false, port;
  const server = createServer((request, response) => {
    if (served || request.method !== 'GET' || request.url !== path || request.headers.host !== '127.0.0.1:' + port) {
      response.writeHead(404, {'cache-control': 'no-store'}); response.end(); return;
    }
    served = true;
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store, max-age=0',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      connection: 'close',
    });
    response.once('finish', () => server.closeAllConnections());
    response.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>Recuperación privada USDC</title><h1>Recuperar espacio ' + role + '</h1><p>Acceso humano sintético conservado con Windows DPAPI. Este enlace se sirve una sola vez.</p><a rel="noreferrer" href="' + recoveryLink + '">Abrir historial privado de ' + role + '</a></html>');
    recoveryLink = undefined;
    server.close(); clearTimeout(timer);
  });
  server.on('error', () => { recoveryLink = undefined; clearTimeout(timer); console.error('USDC_RECOVERY_SERVER_FAILED'); process.exitCode = 1; });
  const timer = setTimeout(() => { recoveryLink = undefined; server.closeAllConnections(); server.close(); }, 60000);
  server.listen(0, '127.0.0.1', () => {
    port = server.address().port;
    // The only stdout fields are public navigation metadata. Never print href/access.
    console.log(JSON.stringify({port, id, origin: target.origin}));
  });
}

await main().catch(() => { console.error('USDC_RECOVERY_HANDOFF_FAILED'); process.exitCode = 1; });
