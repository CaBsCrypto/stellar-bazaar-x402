import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Redis } from '@upstash/redis';

type Counts = { redis: number; commandsUpperBound: number; outboundPayloadBytes: number; inboundPayloadBytes: number; uncertain: boolean };
const scope = new AsyncLocalStorage<Counts>();
const enabled = () => process.env.BAZAAR_ACCEPTANCE_METER === 'true';
const limits = { redis: 32, commandsUpperBound: 224, outboundPayloadBytes: 4 * 1048576, inboundPayloadBytes: 8 * 1048576 };

/** Only payload counts, never credentials, keys or record contents, reach responses. */
export function measuredHandler<A extends unknown[]>(handler: (...args: A) => Response | Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    if (!enabled() || scope.getStore()) return handler(...args);
    const counts: Counts = { redis: 0, commandsUpperBound: 0, outboundPayloadBytes: 0, inboundPayloadBytes: 0, uncertain: false };
    return scope.run(counts, async () => {
      const response = await handler(...args);
      const requestId = randomUUID();
      console.info(JSON.stringify({ acceptanceMeter: 'v1', requestId, ...counts }));
      response.headers.set('X-Bazaar-Acceptance-Request-Id', requestId);
      response.headers.set('X-Bazaar-Acceptance-Meter', 'v1');
      response.headers.set('X-Bazaar-Redis-Requests', String(counts.redis));
      response.headers.set('X-Bazaar-Redis-Commands-Upper-Bound', String(counts.commandsUpperBound));
      response.headers.set('X-Bazaar-Redis-Outbound-Payload-Bytes', String(counts.outboundPayloadBytes));
      response.headers.set('X-Bazaar-Redis-Inbound-Payload-Bytes', String(counts.inboundPayloadBytes));
      response.headers.set('X-Bazaar-Redis-Uncertain', String(counts.uncertain));
      return response;
    });
  };
}

export function meteredRedis(redis: Redis): Redis {
  redis.use(async (request, next) => {
    if (!enabled()) return next(request);
    const counts = scope.getStore();
    if (!counts) throw Error('ACCEPTANCE_SCOPE_REQUIRED');
    const prefix = process.env.BAZAAR_WORKSPACE_PREFIX;
    if (!/^bazaar-workspace:pilot-[a-f0-9]{32}$/.test(prefix ?? '')) throw Error('ACCEPTANCE_NAMESPACE_REQUIRED');
    const suffix = prefix!.slice('bazaar-workspace:'.length);
    const allowed = [prefix!, 'bazaar-market:' + suffix, 'bazaar-review:' + suffix];
    const body = request.body;
    if (!Array.isArray(body) || typeof body[0] !== 'string') throw Error('ACCEPTANCE_COMMAND_REQUIRED');
    const command = body[0].toLowerCase();
    let keys: unknown[];
    let commandBound: number;
    if (command === 'eval') {
      const script = body[1];
      if (typeof script !== 'string' || !Number.isInteger(Number(body[2]))) throw Error('ACCEPTANCE_SCRIPT_REQUIRED');
      keys = body.slice(3, 3 + Number(body[2]));
      // These reviewed scripts contain no loops; count EVAL plus every possible redis.call.
      if (/\b(for|while|repeat)\b/.test(script) || !/redis\.call/.test(script)) throw Error('ACCEPTANCE_SCRIPT_UNBOUNDED');
      commandBound = 1 + (script.match(/redis\.call\s*\(/g)?.length ?? 0);
    } else if (['get', 'mget', 'smembers'].includes(command)) {
      keys = body.slice(1); commandBound = 1;
    } else throw Error('ACCEPTANCE_COMMAND_DENIED');
    if (!keys.length || keys.some(key => typeof key !== 'string' || !allowed.some(p => key.startsWith(p + ':')))) throw Error('ACCEPTANCE_KEY_DENIED');
    const outbound = Buffer.byteLength(JSON.stringify(body));
    if (counts.redis + 1 > limits.redis || counts.commandsUpperBound + commandBound > limits.commandsUpperBound || counts.outboundPayloadBytes + outbound > limits.outboundPayloadBytes || counts.inboundPayloadBytes >= limits.inboundPayloadBytes) throw Error('ACCEPTANCE_REQUEST_BUDGET');
    counts.redis++; counts.commandsUpperBound += commandBound; counts.outboundPayloadBytes += outbound;
    try {
      const response = await next(request);
      counts.inboundPayloadBytes += Buffer.byteLength(JSON.stringify(response));
      if (response.error || counts.inboundPayloadBytes > limits.inboundPayloadBytes) { counts.uncertain = true; throw Error('ACCEPTANCE_REDIS_RESULT_UNCONFIRMED'); }
      return response;
    } catch (error) { counts.uncertain = true; throw error; }
  });
  return redis;
}
