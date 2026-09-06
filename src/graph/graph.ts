/**
 * LazyBrain — Capability Knowledge Graph
 *
 * Core graph data structure with CRUD operations and BFS/DFS traversal.
 * Serializes to/from graph.json.
 */

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

import type {
  Capability,
  CapabilityGraph,
  Link,
  LinkType,
  WikiCard,
} from '../types.js';
import { isLinkType } from '../types.js';
import { GRAPH_PATH, GRAPH_VERSION } from '../constants.js';

function isCapabilityCostLevel(value: unknown): value is Capability['costLevel'] {
  return value === 'free' || value === 'low' || value === 'medium' || value === 'high';
}

function isCapabilityRiskLevel(value: unknown): value is Capability['riskLevel'] {
  return value === 'safe' || value === 'caution' || value === 'destructive';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCapabilityKind(value: unknown): value is Capability['kind'] {
  return value === 'skill' || value === 'plugin' || value === 'mcp' || value === 'agent' || value === 'command' || value === 'mode' || value === 'hook';
}

function isCapabilityStatus(value: unknown): value is Capability['status'] {
  return value === 'installed' || value === 'available' || value === 'disabled';
}

function isPlatform(value: unknown): value is Capability['compatibility'][number] {
  return value === 'claude-code' || value === 'cursor' || value === 'codex' || value === 'kiro' || value === 'opencode' || value === 'universal';
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}

function loadCapability(value: unknown): Capability | null {
  if (!isRecord(value)
    || typeof value.id !== 'string' || value.id.length === 0
    || !isCapabilityKind(value.kind)
    || typeof value.name !== 'string'
    || typeof value.description !== 'string'
    || typeof value.origin !== 'string'
    || !isCapabilityStatus(value.status)
    || typeof value.category !== 'string') {
    return null;
  }

  const compatibility = stringArray(value.compatibility)?.filter(isPlatform) ?? ['universal'];
  const capability = {
    id: value.id,
    kind: value.kind,
    name: value.name,
    description: value.description,
    origin: value.origin,
    provider: typeof value.provider === 'string' ? value.provider : value.origin,
    conflictGroup: typeof value.conflictGroup === 'string' ? value.conflictGroup : undefined,
    sideEffects: stringArray(value.sideEffects) as Capability['sideEffects'],
    status: value.status,
    compatibility,
    filePath: typeof value.filePath === 'string' ? value.filePath : undefined,
    tags: stringArray(value.tags) ?? [],
    exampleQueries: stringArray(value.exampleQueries) ?? [],
    category: value.category,
    scenario: typeof value.scenario === 'string' ? value.scenario : undefined,
    explanation_template: typeof value.explanation_template === 'string' ? value.explanation_template : undefined,
    meta: isRecord(value.meta) ? value.meta : undefined,
    triggers: stringArray(value.triggers),
    aliases: stringArray(value.aliases),
    tier: value.tier === 0 || value.tier === 1 || value.tier === 2 ? value.tier : undefined,
    evolvedTags: stringArray(value.evolvedTags),
    costLevel: isCapabilityCostLevel(value.costLevel) ? value.costLevel : undefined,
    riskLevel: isCapabilityRiskLevel(value.riskLevel) ? value.riskLevel : undefined,
    requiresConfirmation: isBoolean(value.requiresConfirmation) ? value.requiresConfirmation : undefined,
    hiddenByDefault: isBoolean(value.hiddenByDefault) ? value.hiddenByDefault : undefined,
    sourcePriority: isNumber(value.sourcePriority) ? value.sourcePriority : undefined,
    overlapsWith: stringArray(value.overlapsWith),
    schema: isRecord(value.schema) ? value.schema as unknown as Capability['schema'] : undefined,
    discovery: value.discovery === 'local-file' || value.discovery === 'plugin-cache' || value.discovery === 'configured' || value.discovery === 'catalog-entry' || value.discovery === 'builtin-example' ? value.discovery : undefined,
    invocationPolicy: value.invocationPolicy === 'implicit-allowed' || value.invocationPolicy === 'explicit-only' ? value.invocationPolicy : undefined,
  } as Capability & {
    discovery?: 'local-file' | 'plugin-cache' | 'configured' | 'catalog-entry' | 'builtin-example';
    invocationPolicy?: 'implicit-allowed' | 'explicit-only';
  };
  return capability;
}

function loadLink(value: unknown, nodeIds: Set<string>): Link | null {
  if (!isRecord(value)
    || typeof value.source !== 'string' || !nodeIds.has(value.source)
    || typeof value.target !== 'string' || !nodeIds.has(value.target)
    || !isLinkType(value.type)
    || !isNumber(value.confidence)) {
    return null;
  }
  return {
    source: value.source,
    target: value.target,
    type: value.type,
    confidence: value.confidence,
    description: typeof value.description === 'string' ? value.description : undefined,
    diff: typeof value.diff === 'string' ? value.diff : undefined,
  };
}

export class Graph {
  private nodes: Map<string, Capability> = new Map();
  private adjacency: Map<string, Link[]> = new Map();
  private compileModel?: string;
  private compiledAt?: string;
  private compileErrors: string[] = [];

  // ─── Load / Save ────────────────────────────────────────────────────────

  static load(path: string = GRAPH_PATH): Graph {
    const g = new Graph();
    if (!existsSync(path)) return g;

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return g;
    }
    if (!isRecord(raw)) return g;

    for (const node of Array.isArray(raw.nodes) ? raw.nodes : []) {
      const capability = loadCapability(node);
      if (capability) g.addNode(capability);
    }
    const nodeIds = new Set(g.nodes.keys());
    for (const link of Array.isArray(raw.links) ? raw.links : []) {
      const validLink = loadLink(link, nodeIds);
      if (validLink) g.addLinkInternal(validLink);
    }
    g.compileModel = typeof raw.compileModel === 'string' ? raw.compileModel : undefined;
    g.compiledAt = typeof raw.compiledAt === 'string' ? raw.compiledAt : undefined;
    g.compileErrors = stringArray(raw.compileErrors) ?? [];
    return g;
  }

  save(path: string = GRAPH_PATH): void {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const nodes = [...this.nodes.values()];
    const data: CapabilityGraph = {
      version: GRAPH_VERSION,
      compiledAt: this.compiledAt ?? new Date().toISOString(),
      compileModel: this.compileModel,
      compileErrors: this.compileErrors,
      nodes,
      links: this.getAllLinks(),
      categories: [...new Set(nodes.map(n => n.category))].sort(),
    };
    const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
    let fd: number | undefined;
    try {
      fd = openSync(temporaryPath, 'wx');
      writeFileSync(fd, JSON.stringify(data));
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      renameSync(temporaryPath, path);
    } catch (error) {
      if (fd !== undefined) closeSync(fd);
      try { unlinkSync(temporaryPath); } catch {}
      throw error;
    }
  }

  // ─── Node CRUD ──────────────────────────────────────────────────────────

  addNode(cap: Capability): void {
    this.nodes.set(cap.id, cap);
    if (!this.adjacency.has(cap.id)) {
      this.adjacency.set(cap.id, []);
    }
  }

  getNode(id: string): Capability | undefined {
    return this.nodes.get(id);
  }

  findByName(name: string): Capability | undefined {
    for (const cap of this.nodes.values()) {
      if (cap.name === name) return cap;
    }
    return undefined;
  }

  removeNode(id: string): boolean {
    if (!this.nodes.has(id)) return false;
    this.nodes.delete(id);
    this.adjacency.delete(id);
    for (const [nodeId, links] of this.adjacency) {
      this.adjacency.set(
        nodeId,
        links.filter(l => l.source !== id && l.target !== id),
      );
    }
    return true;
  }

  getAllNodes(): Capability[] {
    return [...this.nodes.values()];
  }

  getNodeCount(): number {
    return this.nodes.size;
  }

  // ─── Link CRUD ──────────────────────────────────────────────────────────

  addLink(link: Link): void {
    if (!this.nodes.has(link.source) || !this.nodes.has(link.target)) return;
    if (!isLinkType(link.type)) return;
    this.addLinkInternal(link);
  }

  private addLinkInternal(link: Link): void {
    if (!this.adjacency.has(link.source)) this.adjacency.set(link.source, []);
    if (!this.adjacency.has(link.target)) this.adjacency.set(link.target, []);

    const existing = this.adjacency.get(link.source)!;
    const isDup = existing.some(
      l => l.target === link.target && l.type === link.type,
    );
    if (!isDup) {
      this.adjacency.get(link.source)!.push(link);
      this.adjacency.get(link.target)!.push({
        ...link,
        source: link.target,
        target: link.source,
      });
    }
  }

  getLinks(nodeId: string): Link[] {
    return this.adjacency.get(nodeId) ?? [];
  }

  getLinksByType(nodeId: string, type: LinkType): Link[] {
    return this.getLinks(nodeId).filter(l => l.type === type);
  }

  getAllLinks(): Link[] {
    const seen = new Set<string>();
    const links: Link[] = [];
    for (const nodeLinks of this.adjacency.values()) {
      for (const link of nodeLinks) {
        const a = link.source < link.target ? link.source : link.target;
        const b = link.source < link.target ? link.target : link.source;
        const key = `${a}::${b}::${link.type}`;
        if (!seen.has(key)) {
          seen.add(key);
          links.push(link);
        }
      }
    }
    return links;
  }

  // ─── Traversal ─────────────────────────────────────────────────────────

  bfs(
    startIds: string[],
    depth: number = 2,
    linkFilter?: (link: Link) => boolean,
  ): { nodeIds: string[]; links: Link[] } {
    const visited = new Set<string>();
    const collectedLinks: Link[] = [];
    let frontier = startIds.filter(id => this.nodes.has(id));

    for (const id of frontier) visited.add(id);

    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const nextFrontier: string[] = [];
      for (const nodeId of frontier) {
        for (const link of this.getLinks(nodeId)) {
          if (linkFilter && !linkFilter(link)) continue;
          const neighbor = link.target;
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            nextFrontier.push(neighbor);
          }
          collectedLinks.push(link);
        }
      }
      frontier = nextFrontier;
    }

    return { nodeIds: [...visited], links: collectedLinks };
  }

  neighbors(nodeId: string, type?: LinkType): Capability[] {
    const links = type ? this.getLinksByType(nodeId, type) : this.getLinks(nodeId);
    return links
      .map(l => this.nodes.get(l.target))
      .filter((n): n is Capability => n !== undefined);
  }

  // ─── Query Helpers ────────────────────────────────────────────────────

  getByCategory(category: string): Capability[] {
    return [...this.nodes.values()].filter(n => n.category === category);
  }

  getByKind(kind: Capability['kind']): Capability[] {
    return [...this.nodes.values()].filter(n => n.kind === kind);
  }

  getByStatus(status: Capability['status']): Capability[] {
    return [...this.nodes.values()].filter(n => n.status === status);
  }

  getByPlatform(platform: Capability['compatibility'][number]): Capability[] {
    return [...this.nodes.values()].filter(
      n => n.compatibility.includes(platform) || n.compatibility.includes('universal'),
    );
  }

  // ─── Stats ───────────────────────────────────────────────────────────

  stats(): {
    nodes: number;
    links: number;
    categories: number;
    byKind: Record<string, number>;
    byStatus: Record<string, number>;
  } {
    const byKind: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const node of this.nodes.values()) {
      byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
      byStatus[node.status] = (byStatus[node.status] ?? 0) + 1;
    }
    return {
      nodes: this.nodes.size,
      links: this.getAllLinks().length,
      categories: new Set([...this.nodes.values()].map(n => n.category)).size,
      byKind,
      byStatus,
    };
  }

  // ─── Wiki Card ─────────────────────────────────────────────────────────

  getWikiCard(nodeId: string): WikiCard | null {
    const node = this.nodes.get(nodeId);
    if (!node) return null;

    const composesWith: WikiCard['composesWith'] = [];
    const similarTo: WikiCard['similarTo'] = [];
    const dependsOn: WikiCard['dependsOn'] = [];

    for (const link of this.getLinks(nodeId)) {
      const neighbor = this.nodes.get(link.target);
      if (!neighbor) continue;

      switch (link.type) {
        case 'composes_with':
          composesWith.push({
            capability: neighbor,
            reason: link.description ?? '',
          });
          break;
        case 'similar_to':
          similarTo.push({
            capability: neighbor,
            diff: link.diff ?? link.description ?? '',
          });
          break;
        case 'depends_on':
          dependsOn.push({ capability: neighbor });
          break;
      }
    }

    return {
      capability: node,
      primaryUse: node.scenario,
      composesWith,
      similarTo,
      dependsOn,
      tags: node.tags.slice(0, 5),
      topExampleQueries: node.exampleQueries.slice(0, 3),
    };
  }

  // ─── Metadata ─────────────────────────────────────────────────────────

  setCompileInfo(model: string, errors: string[] = []): void {
    this.compileModel = model;
    this.compiledAt = new Date().toISOString();
    this.compileErrors = [...errors];
  }

  getCompileErrors(): string[] {
    return [...this.compileErrors];
  }
}
