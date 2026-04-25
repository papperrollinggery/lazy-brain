import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ROUTE_EVENTS_PATH } from '../constants.js';
import type { RouteMode, RouteSpec } from '../types.js';

export type RouteEventSource = 'cli' | 'api' | 'hook-gate' | 'prompt' | 'mcp';

export interface RouteEvent {
  timestamp: string;
  source: RouteEventSource;
  queryHash: string;
  mode: RouteMode;
  combo?: string;
  skillIds: string[];
  warningKinds: string[];
  semanticWarning: boolean;
}

export interface RouteStats {
  total: number;
  bySource: Record<string, number>;
  byMode: Record<string, number>;
  topCombos: Array<{ combo: string; count: number }>;
  semanticWarningCount: number;
  lastEventAt?: string;
}

function ensureParent(): void {
  mkdirSync(dirname(ROUTE_EVENTS_PATH), { recursive: true });
}

export function hashQuery(query: string): string {
  return createHash('sha1').update(query).digest('hex').slice(0, 16);
}

function warningKinds(warnings: string[]): string[] {
  return [...new Set(warnings.map((warning) => {
    const lower = warning.toLowerCase();
    if (lower.includes('semantic')) return 'semantic';
    if (lower.includes('embedding')) return 'embedding';
    if (lower.includes('llm')) return 'llm';
    if (lower.includes('missing')) return 'missing';
    return 'general';
  }))];
}

export function recordRouteEvent(input: {
  query: string;
  source: RouteEventSource;
  mode: RouteMode;
  combo?: string;
  skillIds?: string[];
  warnings?: string[];
}): void {
  try {
    const warnings = input.warnings ?? [];
    const event: RouteEvent = {
      timestamp: new Date().toISOString(),
      source: input.source,
      queryHash: hashQuery(input.query),
      mode: input.mode,
      combo: input.combo,
      skillIds: input.skillIds ?? [],
      warningKinds: warningKinds(warnings),
      semanticWarning: warnings.some((warning) => /semantic|embedding/i.test(warning)),
    };
    ensureParent();
    appendFileSync(ROUTE_EVENTS_PATH, JSON.stringify(event) + '\n', 'utf-8');
  } catch {}
}

export function recordRouteSpec(spec: RouteSpec, source: RouteEventSource): void {
  recordRouteEvent({
    query: spec.query,
    source,
    mode: spec.mode,
    combo: spec.combo,
    skillIds: spec.skills.map((skill) => skill.id),
    warnings: spec.warnings,
  });
}

export function readRouteStats(): RouteStats {
  const stats: RouteStats = {
    total: 0,
    bySource: {},
    byMode: {},
    topCombos: [],
    semanticWarningCount: 0,
  };
  if (!existsSync(ROUTE_EVENTS_PATH)) return stats;

  const comboCounts = new Map<string, number>();
  const lines = readFileSync(ROUTE_EVENTS_PATH, 'utf-8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Partial<RouteEvent>;
      if (!event.source || !event.mode) continue;
      stats.total++;
      stats.bySource[event.source] = (stats.bySource[event.source] ?? 0) + 1;
      stats.byMode[event.mode] = (stats.byMode[event.mode] ?? 0) + 1;
      if (event.semanticWarning) stats.semanticWarningCount++;
      if (event.combo) comboCounts.set(event.combo, (comboCounts.get(event.combo) ?? 0) + 1);
      if (event.timestamp) stats.lastEventAt = event.timestamp;
    } catch {}
  }
  stats.topCombos = [...comboCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([combo, count]) => ({ combo, count }));
  return stats;
}
