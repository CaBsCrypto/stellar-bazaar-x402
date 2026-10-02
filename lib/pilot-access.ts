// Browser-safe access packets. Never import the server store into this module.
export type PilotAccess = {
  version: 'bazaar-pilot-access/v1'; origin: string; creationId: string;
  bootstrap: string; human: string; agent: string;
};
const tokenPattern = /^[a-zA-Z0-9_-]{43}$/;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function parsePilotAccess(text: string, origin: string): PilotAccess {
  if (text.length > 2048) throw new Error('INVALID_PACKET');
  const packet = JSON.parse(text);
  if (!packet || typeof packet !== 'object' || Array.isArray(packet) ||
      Object.keys(packet).sort().join(',') !== 'agent,bootstrap,creationId,human,origin,version' ||
      packet.version !== 'bazaar-pilot-access/v1' || packet.origin !== origin ||
      !uuidPattern.test(packet.creationId) ||
      !['bootstrap', 'human', 'agent'].every(key => typeof packet[key] === 'string' && tokenPattern.test(packet[key])) ||
      new Set([packet.bootstrap, packet.human, packet.agent]).size !== 3) throw new Error('INVALID_PACKET');
  return packet;
}
export function createPilotAccess(origin: string): PilotAccess {
  const token = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  return { version: 'bazaar-pilot-access/v1', origin, creationId: crypto.randomUUID(), bootstrap: token(), human: token(), agent: token() };
}
export async function pilotHash(token: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}
