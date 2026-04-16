/**
 * LazyBrain — Capability Evolution
 *
 * 基于用户行为学习新 tags（evolvedTags）
 * - 每个 capability 最多 5 个 evolvedTags
 * - 只从 accepted 记录中学习
 * - 提供 --rollback 支持
 */

import { existsSync, copyFileSync, readdirSync } from 'node:fs';
import { Graph } from '../graph/graph.js';
import { GRAPH_PATH } from '../constants.js';
import { loadRecentHistory } from '../history/history.js';

const MAX_EVOLVED_TAGS = 5;

interface EvolveOptions {
  dryRun?: boolean;
  rollback?: boolean;
}

export function evolveCapabilities(options: EvolveOptions = {}): void {
  const { dryRun = false, rollback = false } = options;

  if (rollback) {
    doRollback();
    return;
  }

  const history = loadRecentHistory(200).filter(e => e.accepted);
  if (history.length === 0) {
    console.log('No accepted history found. Run lazybrain hook first.');
    return;
  }

  if (!existsSync(GRAPH_PATH)) {
    console.error('No graph found. Run `lazybrain scan && lazybrain compile` first.');
    return;
  }

  const graph = Graph.load(GRAPH_PATH);
  const tagCounts = new Map<string, Map<string, number>>();

  for (const entry of history) {
    const tool = entry.matched;
    if (!tagCounts.has(tool)) tagCounts.set(tool, new Map());

    const parts = entry.query.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
    const toolTags = tagCounts.get(tool)!;
    for (const part of parts) {
      toolTags.set(part, (toolTags.get(part) ?? 0) + 1);
    }
  }

  let evolved = 0;
  for (const [toolName, counts] of tagCounts) {
    const node = graph.getAllNodes().find(n => n.name === toolName);
    if (!node) continue;

    const existingTags = new Set(node.tags.map(t => t.toLowerCase()));
    const newTags = [...counts.entries()]
      .filter(([tag]) => !existingTags.has(tag))
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_EVOLVED_TAGS - node.evolvedTags.length)
      .map(([tag]) => tag);

    if (newTags.length > 0) {
      if (dryRun) {
        console.log(`[DRY] ${toolName}: would add tags ${JSON.stringify(newTags)}`);
      } else {
        node.evolvedTags = [...(node.evolvedTags ?? []), ...newTags].slice(0, MAX_EVOLVED_TAGS);
        evolved++;
        console.log(`[EVOLVED] ${toolName}: +${newTags.length} tags`);
      }
    }
  }

  if (!dryRun && evolved > 0) {
    const backupPath = `${GRAPH_PATH}.backup.${Date.now()}`;
    copyFileSync(GRAPH_PATH, backupPath);
    console.log(`\nBackup saved to: ${backupPath}`);

    graph.save();
    console.log(`Updated ${evolved} capabilities with evolved tags.`);
  }

  if (evolved === 0) {
    console.log('No new tags to learn.');
  }
}

function doRollback(): void {
  const dir = GRAPH_PATH.substring(0, GRAPH_PATH.lastIndexOf('/'));
  const base = GRAPH_PATH.split('/').pop();
  if (!base) return;

  const backups = readdirSync(dir)
    .filter(f => f.startsWith(base + '.backup.'))
    .sort()
    .reverse();

  if (backups.length === 0) {
    console.error('No backups found.');
    return;
  }

  const latest = `${dir}/${backups[0]}`;
  copyFileSync(latest, GRAPH_PATH);
  console.log(`Rolled back to: ${latest}`);
}
