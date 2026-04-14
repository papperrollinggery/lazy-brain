/**
 * LazyBrain — Capability Knowledge Graph
 *
 * Core graph data structure with CRUD operations and BFS/DFS traversal.
 * Serializes to/from graph.json.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  Capability,
  CapabilityGraph,
  Link,
  LinkType,
  Recommendation,
  MatchResult,
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
    const raw: CapabilityGraph = JSON.parse(readFileSync(path, 'utf-8'));
    for (const node of raw.nodes) {
      g.nodes.set(node.id, node);
    }
    for (const link of raw.links) {
      g.addLinkInternal(link);
    }
    g.compileModel = raw.compileModel;
    g.compiledAt = raw.compiledAt;
    return g;
  }

  save(path: string = GRAPH_PATH): void {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const data: CapabilityGraph = {
      version: GRAPH_VERSION,
      compiledAt: this.compiledAt ?? new Date().toISOString(),
      compileModel: this.compileModel,
      nodes: [...this.nodes.values()],
      links: this.getAllLinks(),
      categories: [...new Set([...this.nodes.values()].map(n => n.category))].sort(),
    };
    writeFileSync(path, JSON.stringify(data, null, 2));
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
    // Remove all links referencing this node
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
    // Ensure both nodes exist
    if (!this.nodes.has(link.source) || !this.nodes.has(link.target)) return;
    this.addLinkInternal(link);
  }

  private addLinkInternal(link: Link): void {
    // Bidirectional: add to both adjacency lists
    if (!this.adjacency.has(link.source)) this.adjacency.set(link.source, []);
    if (!this.adjacency.has(link.target)) this.adjacency.set(link.target, []);

    // Avoid duplicate links
    const existing = this.adjacency.get(link.source)!;
    const isDup = existing.some(
      l => l.target === link.target && l.type === link.type,
    );
    if (!isDup) {
      this.adjacency.get(link.source)!.push(link);
      // Reverse link for bidirectional traversal
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
        // Deduplicate bidirectional pairs
        const key = [link.source, link.target, link.type].sort().join('::');
        if (!seen.has(key)) {
          seen.add(key);
          links.push(link);
        }
      }
    }
    return links;
  }

  // ─── Traversal ──────────────────────────────────────────────────────────

  /**
   * BFS from start nodes, collecting neighbors up to `depth` hops.
   * Returns visited node IDs and traversed links.
   */
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

  /**
   * Find neighbors of a specific link type, 1 hop.
   */
  neighbors(nodeId: string, type?: LinkType): Capability[] {
    const links = type ? this.getLinksByType(nodeId, type) : this.getLinks(nodeId);
    return links
      .map(l => this.nodes.get(l.target))
      .filter((n): n is Capability => n !== undefined);
  }

  // ─── Query Helpers ────────────────────────────────────────────────────

  /** Get all nodes in a category */
  getByCategory(category: string): Capability[] {
    return [...this.nodes.values()].filter(n => n.category === category);
  }

  /** Get all nodes by kind */
  getByKind(kind: Capability['kind']): Capability[] {
    return [...this.nodes.values()].filter(n => n.kind === kind);
  }

  /** Get all nodes by status */
  getByStatus(status: Capability['status']): Capability[] {
    return [...this.nodes.values()].filter(n => n.status === status);
  }

  /** Get all nodes compatible with a platform */
  getByPlatform(platform: Capability['compatibility'][number]): Capability[] {
    return [...this.nodes.values()].filter(
      n => n.compatibility.includes(platform) || n.compatibility.includes('universal'),
    );
  }

  // ─── Stats ────────────────────────────────────────────────────────────

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

  // ─── Metadata ─────────────────────────────────────────────────────────

  setCompileInfo(model: string): void {
    this.compileModel = model;
    this.compiledAt = new Date().toISOString();
  }
}
