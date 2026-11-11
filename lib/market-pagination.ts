import { z } from 'zod';
import { WorkspaceError } from './workspace-types.ts';

export const MARKET_DTO_BYTES = 128 * 1024;
export const marketPageSchema = z.object({ limit: z.number().int().min(1).max(20).optional(), cursor: z.string().max(512).optional() }).strict();
export type MarketPageInput = z.infer<typeof marketPageSchema>;
type Anchor = { version: 1; scope: string; createdAt: string; id: string };
const anchorSchema = z.object({ version: z.literal(1), scope: z.string().min(1).max(180), createdAt: z.string().datetime(), id: z.string().min(1).max(128) }).strict();
export function marketPageFromRequest(request: Request, extraKeys: readonly string[] = []): MarketPageInput {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => !['limit', 'cursor', ...extraKeys].includes(key)) || [...params.keys()].some(key => params.getAll(key).length !== 1)) throw new WorkspaceError('INVALID_REQUEST', 400);
  const limit = params.get('limit');
  if (limit !== null && !/^[1-9]\d*$/.test(limit)) throw new WorkspaceError('INVALID_REQUEST', 400);
  return marketPageSchema.parse({ ...(limit !== null ? { limit: Number(limit) } : {}), ...(params.has('cursor') ? { cursor: params.get('cursor') } : {}) });
}
export function marketPage<T, R>(records: readonly T[], options: MarketPageInput, scope: string,
  anchor: (record: T) => { createdAt: string; id: string }, dto: (record: T) => R, maxBytes = MARKET_DTO_BYTES - 1024) {
  marketPageSchema.parse(options);
  let after: Anchor | undefined;
  if (options.cursor !== undefined) {
    try {
      if (!/^[a-zA-Z0-9_-]+$/.test(options.cursor)) throw Error();
      const decoded = Buffer.from(options.cursor, 'base64url');
      if (decoded.toString('base64url') !== options.cursor) throw Error();
      after = anchorSchema.parse(JSON.parse(decoded.toString('utf8')));
      if (after.scope !== scope) throw Error();
    } catch { throw new WorkspaceError('INVALID_CURSOR', 400); }
  }
  const compare = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
  const ordered = [...records].sort((a, b) => compare(anchor(a), anchor(b))).filter(record => !after || compare(anchor(record), after) > 0);
  const items: R[] = []; let size = 2, last: T | undefined;
  for (const record of ordered) {
    if (items.length >= (options.limit ?? 10)) break;
    const item = dto(record), itemBytes = Buffer.byteLength(JSON.stringify(item), 'utf8') + 1;
    if (size + itemBytes > maxBytes) {
      if (!items.length) throw new WorkspaceError('RESPONSE_TOO_LARGE', 503);
      break;
    }
    items.push(item); size += itemBytes; last = record;
  }
  const partialResults = items.length < ordered.length;
  const nextCursor = partialResults && last ? Buffer.from(JSON.stringify({ version: 1, scope, ...anchor(last) })).toString('base64url') : null;
  return { items, nextCursor, partialResults };
}
export function assertMarketDto(value: unknown) {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MARKET_DTO_BYTES) throw new WorkspaceError('RESPONSE_TOO_LARGE', 503);
  return value;
}
