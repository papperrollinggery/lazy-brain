import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Graph } from '../../src/graph/graph.js';

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
});
