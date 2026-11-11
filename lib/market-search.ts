import { rankServices } from './discovery.ts';
import { toPaidService } from './service-card.ts';
import type { ServiceCard } from './types.ts';
import { WorkspaceError } from './workspace-types.ts';

/** HTTP and MCP discovery share bounded, deterministic search over every active card. */
export function marketSearchQuery(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > 200) throw new WorkspaceError('INVALID_REQUEST', 400);
  const query = value.trim();
  return query || undefined;
}

export function rankMarketRecords<T extends { active: boolean; service: { card: ServiceCard } }>(records: readonly T[], query: string) {
  const active = records.filter(record => record.active);
  const matches = new Map(rankServices(active.map(record => toPaidService(record.service.card)), query).map(match => [match.service.id, match]));
  return { records: active.filter(record => matches.has(record.service.card.id)), matches };
}
