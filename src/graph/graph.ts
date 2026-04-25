/**
 * LazyBrain — Capability Knowledge Graph
 *
 * Core graph data structure with CRUD operations and BFS/DFS traversal.
 * Serializes to/from graph.json.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

function sleepSync(ms: number): void {
  const buf = new SharedArrayBuffer(4);
  const view = new Int32Array(buf);
  Atomics.wait(view, 0, 0, ms);
}

function withFileLock<T>(lockPath: string, fn: () => T, timeoutMs = 3000): T {
  const lockFile = lockPath + '.lock';
  const start = Date.now();
  const maxRetries = Math.ceil(timeoutMs / 50);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
      // Lock acquired
      try {
        return fn();
      } finally {
        try { unlinkSync(lockFile); } catch {}
      }
    } catch {
      // Lock file exists — check if it's stale
      try {
        const stat = statSync(lockFile);
        if (Date.now() - stat.mtimeMs > timeoutMs) {
          // Stale lock, force remove and retry immediately
          try { unlinkSync(lockFile); } catch {}
          continue;
        }
      } catch {
        // Lock file disappeared between check, retry immediately
        continue;
      }
      // Active lock held by another process, wait
      sleepSync(50);
    }
  }

  // All retries exhausted — execute without lock (degraded mode)
  if (process.env.LAZYBRAIN_HOOK !== '1' || process.env.LAZYBRAIN_DEBUG_HOOK === '1') {
    process.stderr.write(`[LazyBrain] Warning: could not acquire file lock after ${timeoutMs}ms, proceeding without lock\n`);
  }
  return fn();
}

import type {
  Capability,
  CapabilityGraph,
  Link,
  LinkType,
  WikiCard,
} from '../types.js';
import { GRAPH_PATH, GRAPH_VERSION } from '../constants.js';

export class Graph {
  private nodes: Map<string, Capability> = new Map();
  private adjacency: Map<string, Link[]> = new Map();
  private compileModel?: string;
  private compiledAt?: string;

  // ─── Load / Save ────────────────────────────────────────────────────────

  static load(path: string = GRAPH_PATH): Graph {
    const g = new Graph();
    if (!existsSync(path)) return g;

    return withFileLock(path, () => {
      const raw: CapabilityGraph = JSON.parse(readFileSync(path, 'utf-8'));
      for (const node of raw.nodes) {
        const validNode: Capability = {
          id: node.id ?? `unknown-${g.nodes.size}`,
          kind: node.kind ?? 'skill',
          name: node.name ?? 'Unnamed',
          description: node.description ?? '',
          origin: node.origin ?? 'unknown',
          status: node.status ?? 'installed',
          compatibility: Array.isArray(node.compatibility) ? node.compatibility : ['universal'],
          filePath: node.filePath,
          tags: Array.isArray(node.tags) ? node.tags : [],
          exampleQueries: Array.isArray(node.exampleQueries) ? node.exampleQueries : [],
          category: node.category ?? 'other',
          scenario: node.scenario,
          meta: node.meta,
          triggers: Array.isArray(node.triggers) ? node.triggers : undefined,
          aliases: Array.isArray(node.aliases) ? node.aliases : undefined,
          tier: node.tier,
          evolvedTags: Array.isArray(node.evolvedTags) ? node.evolvedTags : undefined,
          schema: node.schema,
        };
        g.nodes.set(validNode.id, validNode);
      }
      for (const link of raw.links ?? []) {
        g.addLinkInternal(link);
      }
      g.compileModel = raw.compileModel;
      g.compiledAt = raw.compiledAt;
      return g;
    });
  }

  save(path: string = GRAPH_PATH): void {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    withFileLock(path, () => {
      const nodes = [...this.nodes.values()];
      const data: CapabilityGraph = {
        version: GRAPH_VERSION,
        compiledAt: this.compiledAt ?? new Date().toISOString(),
        compileModel: this.compileModel,
        nodes,
        links: this.getAllLinks(),
        categories: [...new Set(nodes.map(n => n.category))].sort(),
      };
      writeFileSync(path, JSON.stringify(data));
    });
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

  setCompileInfo(model: string): void {
    this.compileModel = model;
    this.compiledAt = new Date().toISOString();
  }
}
