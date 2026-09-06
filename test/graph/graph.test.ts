import { chmodSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { Graph } from '../../src/graph/graph.js';

function runGraphProcess(bundlePath: string, graphPath: string, mode: 'writer' | 'reader'): Promise<void> {
  const program = `
    const [bundleUrl, path, mode] = process.argv.slice(1);
    const { Graph } = await import(bundleUrl);
    const yieldNow = () => new Promise(resolve => setImmediate(resolve));
    if (mode === 'writer') {
      for (let i = 0; i < 80; i++) {
        const graph = new Graph();
        graph.addNode({ id: 'writer-' + i, kind: 'skill', name: 'writer', description: 'writer', origin: 'test', status: 'installed', compatibility: ['universal'], tags: [], exampleQueries: [], category: 'test' });
        graph.save(path);
        await yieldNow();
      }
    } else {
      for (let i = 0; i < 200; i++) {
        const graph = Graph.load(path);
        if (graph.getNodeCount() !== 1) throw new Error('reader observed a partial graph snapshot');
        await yieldNow();
      }
    }
  `;
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--input-type=module', '--eval', program, pathToFileURL(bundlePath).href, graphPath, mode], (error, _stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve();
    });
  });
}

describe('Graph load/save', () => {
  it('preserves capability governance and conflict metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-graph-'));
    const graphPath = join(dir, 'graph.json');

    try {
      const graph = new Graph();
      graph.addNode({
        id: 'danger-release',
        kind: 'skill',
        name: 'danger-release',
        description: 'Publishes production releases.',
        origin: 'plugin',
        provider: 'plugin',
        conflictGroup: 'skill:release',
        sideEffects: ['publishes', 'destructive'],
        status: 'installed',
        compatibility: ['codex'],
        filePath: '/tmp/danger-release/SKILL.md',
        tags: ['release'],
        exampleQueries: ['publish release'],
        category: 'release',
        explanation_template: '{tool_name} handles release work.',
        triggers: ['release'],
        aliases: ['ship'],
        tier: 0,
        meta: { version: '1.0.0' },
        evolvedTags: ['ship'],
        costLevel: 'high',
        riskLevel: 'destructive',
        requiresConfirmation: true,
        hiddenByDefault: true,
        sourcePriority: 3,
        overlapsWith: ['release'],
      });

      graph.save(graphPath);
      const loaded = Graph.load(graphPath).getNode('danger-release');

      expect(loaded).toMatchObject({
        provider: 'plugin',
        conflictGroup: 'skill:release',
        sideEffects: ['publishes', 'destructive'],
        explanation_template: '{tool_name} handles release work.',
        triggers: ['release'],
        aliases: ['ship'],
        tier: 0,
        meta: { version: '1.0.0' },
        evolvedTags: ['ship'],
        costLevel: 'high',
        riskLevel: 'destructive',
        requiresConfirmation: true,
        hiddenByDefault: true,
        sourcePriority: 3,
        overlapsWith: ['release'],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads only well-formed graph records and preserves compatible scanner metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-graph-'));
    const graphPath = join(dir, 'graph.json');
    const node = {
      id: 'valid', kind: 'skill', name: 'valid', description: 'valid', origin: 'local', status: 'installed',
      compatibility: ['codex'], tags: [], exampleQueries: [], category: 'test',
      discovery: 'plugin-cache', invocationPolicy: 'explicit-only',
    };
    writeFileSync(graphPath, JSON.stringify({
      version: '1', compiledAt: '2026-09-07T00:00:00.000Z', compileModel: 'local', compileErrors: ['kept', 3],
      nodes: [node, null, { ...node, id: 3 }, { ...node, kind: 'invalid' }],
      links: [
        { source: 'valid', target: 'valid', type: 'similar_to', confidence: 0.8 },
        { source: 'valid', target: 'missing', type: 'similar_to', confidence: 0.8 },
        { source: 'valid', target: 'valid', type: 'bad', confidence: 0.8 },
        { source: 'valid', target: 'valid', type: 'similar_to', confidence: 'high' },
      ],
    }));

    try {
      const loaded = Graph.load(graphPath);
      expect(loaded.getNodeCount()).toBe(1);
      expect(loaded.getAllLinks()).toHaveLength(1);
      expect(loaded.getNode('valid')).toMatchObject({
        discovery: 'plugin-cache',
        invocationPolicy: 'explicit-only',
      });
      loaded.save(graphPath);
      expect(Graph.load(graphPath).getNode('valid')).toMatchObject({
        discovery: 'plugin-cache',
        invocationPolicy: 'explicit-only',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads without creating or waiting on a lock in a non-writable directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-graph-'));
    const graphPath = join(dir, 'graph.json');
    const lockPath = `${graphPath}.lock`;
    const graph = new Graph();
    graph.addNode({
      id: 'read-only', kind: 'skill', name: 'read-only', description: 'read-only', origin: 'local', status: 'installed',
      compatibility: ['universal'], tags: [], exampleQueries: [], category: 'test',
    });
    graph.save(graphPath);
    writeFileSync(lockPath, 'another process');
    const before = readdirSync(dir).sort();
    chmodSync(dir, 0o555);

    try {
      const started = Date.now();
      expect(Graph.load(graphPath).getNode('read-only')).toBeDefined();
      expect(Date.now() - started).toBeLessThan(500);
      expect(readdirSync(dir).sort()).toEqual(before);
    } finally {
      chmodSync(dir, 0o755);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps readers on complete snapshots during concurrent process writes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-graph-'));
    const graphPath = join(dir, 'graph.json');
    const bundlePath = join(dir, 'graph.bundle.mjs');
    const initial = new Graph();
    initial.addNode({
      id: 'initial', kind: 'skill', name: 'initial', description: 'initial', origin: 'test', status: 'installed',
      compatibility: ['universal'], tags: [], exampleQueries: [], category: 'test',
    });
    initial.save(graphPath);
    buildSync({
      entryPoints: [join(process.cwd(), 'src/graph/graph.ts')],
      bundle: true,
      format: 'esm',
      outfile: bundlePath,
      platform: 'node',
    });

    try {
      await Promise.all([
        runGraphProcess(bundlePath, graphPath, 'writer'),
        runGraphProcess(bundlePath, graphPath, 'reader'),
        runGraphProcess(bundlePath, graphPath, 'reader'),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 10_000);
});
