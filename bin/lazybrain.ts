#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Graph } from '../src/graph/graph.js';
import { GRAPH_PATH, LAZYBRAIN_DIR } from '../src/constants.js';
import { scan, detectSources } from '../src/scanner/scanner.js';
import { find, type FindResult } from '../src/matcher/matcher.js';
import { BUILTIN_SKILLS, type BuiltinSkill } from '../src/knowledge/builtin.js';
import { append, getStats, loadRecent } from '../src/history/history.js';
import { detectPatterns, unusedHighValue } from '../src/insights/patterns.js';
import { findCombo } from '../src/combos/registry.js';
import { orchestrate } from '../src/orchestrator/engine.js';
import { signalFromQuery } from '../src/orchestrator/signals.js';
import { box, bold, cyan, dim, green, highlight, progressBar, yellow } from '../src/ui/terminal.js';
import type { Capability, RawCapability } from '../src/types.js';
import { getPackageVersion } from '../src/version.js';
import { join } from 'node:path';

const args = process.argv.slice(2);

function out(text = ''): void {
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

function err(text: string): void {
  process.stderr.write(text.endsWith('\n') ? text : `${text}\n`);
}

function queryFrom(start: number): string {
  return args.slice(start).join(' ').trim();
}

function loadGraphIfPresent(): Graph | undefined {
  return existsSync(GRAPH_PATH) ? Graph.load(GRAPH_PATH) : undefined;
}

function words(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) ?? []).filter((word) => word.length > 1))];
}

function capabilityId(kind: string, name: string, origin: string, platform?: string): string {
  const prefix = platform && platform !== 'claude-code' ? `${platform}:` : '';
  return createHash('sha256').update(`${prefix}${kind}:${name}:${origin}`).digest('hex').slice(0, 16);
}

function classify(raw: RawCapability): string {
  const text = `${raw.name} ${raw.description}`.toLowerCase();
  if (/security|auth|secret|安全|漏洞/.test(text)) return 'security';
  if (/test|tdd|coverage|测试/.test(text)) return 'testing';
  if (/deploy|release|git|ci|cd|发布|部署/.test(text)) return 'release';
  if (/frontend|react|ui|ux|css|前端|界面/.test(text)) return 'frontend';
  if (/database|sql|data|数据库/.test(text)) return 'data';
  if (/doc|readme|write|文档/.test(text)) return 'content';
  if (/plan|architecture|design|架构|规划/.test(text)) return 'planning';
  return 'development';
}

function builtinToCapability(skill: BuiltinSkill): Capability {
  return {
    id: `builtin:${skill.name}`,
    kind: 'skill',
    name: skill.name,
    description: skill.description,
    origin: 'builtin',
    status: 'installed',
    compatibility: ['universal'],
    tags: [...new Set([skill.category, ...words(skill.name), ...skill.triggers.flatMap(words)].slice(0, 24))],
    exampleQueries: skill.examples,
    category: skill.category,
    triggers: skill.triggers,
    scenario: skill.description,
  };
}

function rawToCapability(raw: RawCapability): Capability {
  const category = classify(raw);
  return {
    id: capabilityId(raw.kind, raw.name, raw.origin, raw.platform),
    kind: raw.kind,
    name: raw.name,
    description: raw.description,
    origin: raw.origin,
    provider: raw.provider,
    conflictGroup: raw.conflictGroup,
    sideEffects: raw.sideEffects,
    status: raw.disabled ? 'disabled' : 'installed',
    compatibility: raw.compatibility,
    filePath: raw.filePath,
    tags: [...new Set([category, ...words(raw.name), ...words(raw.description), ...(raw.triggers ?? []).flatMap(words)].slice(0, 24))],
    exampleQueries: raw.triggers ?? [],
    category,
    triggers: raw.triggers,
    tier: raw.tier,
    meta: raw.meta,
    schema: raw.schema,
  };
}

function compileGraph(): { graph: Graph; localCount: number } {
  const result = scan();
  const graph = new Graph();
  for (const skill of BUILTIN_SKILLS) graph.addNode(builtinToCapability(skill));
  for (const raw of result.capabilities) graph.addNode(rawToCapability(raw));
  graph.save(GRAPH_PATH);
  return { graph, localCount: result.capabilities.length };
}

function formatFindResult(query: string, results: FindResult[]): string {
  if (results.length === 0) return yellow('No strong match found. Try: lb scan && lb compile');
  const [top, ...rest] = results;
  const lines = [
    `${highlight(`🎯 /${top.skill}`)} ${green(`${Math.round(top.score * 100)}%`)}`,
    top.description,
    dim(`Reason: ${top.reason}`),
  ];
  if (rest.length) {
    lines.push('', 'Also consider:');
    for (const item of rest) lines.push(`· /${item.skill} (${Math.round(item.score * 100)}%) — ${item.description}`);
  }
  if (top.composesWell.length) lines.push('', `💡 Combo: /${top.skill} → /${top.composesWell[0]}`);
  return box(lines, { title: query });
}

function runFind(query: string): void {
  const graph = loadGraphIfPresent();
  const results = find(query, { graph, limit: 3, threshold: 0.5, history: loadRecent(30) });
  out(formatFindResult(query, results));
  const top = results[0];
  if (top) {
    append({
      timestamp: new Date().toISOString(),
      query,
      recommended: top.skill,
      used: top.skill,
      sessionId: process.env.CLAUDE_SESSION_ID ?? process.env.TERM_SESSION_ID ?? 'cli',
    });
  }
}

function runStats(): void {
  const stats = getStats();
  const max = Math.max(1, ...stats.bySkill.map((item) => item.count));
  const lines = [
    bold('📊 Your AI Enhancement Usage (30 days)'),
    '',
    `Total queries: ${stats.total}   Accepted: ${stats.accepted}   Ignored: ${stats.ignored}`,
    '',
    'Most activated',
    ...stats.bySkill.slice(0, 6).map((item) => `/${item.skill} ${progressBar(item.count, max)} ${item.count}x`),
  ];
  const patterns = detectPatterns(stats.recent);
  if (patterns.length) {
    lines.push('', 'Patterns');
    for (const pattern of patterns.slice(0, 3)) lines.push(`${pattern.sequence.join(' → ')} (${pattern.count}x)`);
  }
  out(box(lines));
}

function runDiscover(): void {
  const history = loadRecent(30);
  const skills = unusedHighValue(history);
  const lines = [bold('🔮 Enhancements you should try'), ''];
  if (skills.length === 0) lines.push('No obvious unused high-value skill found.');
  for (let i = 0; i < skills.length; i++) {
    lines.push(`${i + 1}. /${skills[i]}`);
    lines.push(dim('   Based on your recent tasks and unused core workflows.'));
  }
  out(box(lines));
}

function runCombo(query: string): void {
  const combo = findCombo(query);
  if (!combo) {
    out(yellow('No workflow combo found.'));
    return;
  }
  const lines = [
    `${bold('🔗 Recommended workflow:')} ${combo.id}`,
    combo.description,
    '',
    ...combo.workflow.map((step, index) => `${index + 1}. /${combo.skillNames[index] ?? combo.skillNames[0]} — ${step.title}`),
    '',
    `Verification: ${combo.verification.map((item) => item.command).filter(Boolean).join(' && ') || 'focused smoke check'}`,
  ];
  out(box(lines, { title: query }));
}

function runOrchestrate(query: string): void {
  const plan = orchestrate(signalFromQuery(query));
  if (!plan) {
    runFind(query);
    return;
  }
  const lines = [
    `${bold('🎼 Orchestration Plan')} ${green(`${Math.round(plan.confidence * 100)}%`)}`,
    dim(plan.reason),
    '',
    'Enhancements:',
    ...plan.enhancements.map((item) => `${item.priority}. /${item.name} — ${item.reason}`),
    '',
    `Sequence: ${plan.sequence}`,
    `Auto-activate: ${plan.autoActivate ? 'yes' : 'no'}`,
  ];
  out(box(lines, { title: query }));
}

function runScan(): void {
  const start = performance.now();
  const sources = detectSources();
  const result = scan();
  const ms = Math.round(performance.now() - start);
  const lines = [
    `${green('✓')} Scanned ${result.scannedPaths} paths in ${ms}ms`,
    `Found: ${result.capabilities.length} local capabilities`,
    '',
    ...sources.slice(0, 8).map((source) => `${source.tool}: ${source.paths.join(', ')}`),
  ];
  if (result.errors.length) lines.push('', yellow(`Warnings: ${result.errors.length}`));
  out(box(lines, { title: 'scan' }));
}

function runCompile(): void {
  const start = performance.now();
  const { graph, localCount } = compileGraph();
  const ms = Math.round(performance.now() - start);
  out(box([
    `${green('✓')} Compiled knowledge graph in ${ms}ms`,
    `Built-ins: ${BUILTIN_SKILLS.length}`,
    `Local: ${localCount}`,
    `Total: ${graph.getNodeCount()}`,
  ], { title: 'compile' }));
}

function runQuickstart(): void {
  const start = performance.now();
  const sources = detectSources();
  const { graph, localCount } = compileGraph();
  const ms = Math.round(performance.now() - start);
  out(box([
    `${green('✓')} Scanning skill sources`,
    `Found: ${localCount} local capabilities from ${sources.length} sources`,
    `${green('✓')} Compiling knowledge graph`,
    `${graph.getNodeCount()} capabilities indexed`,
    `${green('✓')} Ready in ${ms}ms`,
    '',
    `Try: ${cyan('lb "review this PR for security issues"')}`,
  ], { title: 'quickstart' }));
}

function runConfig(): void {
  if (args[1] !== 'show') {
    out('Usage: lb config show');
    return;
  }
  const path = join(LAZYBRAIN_DIR, 'config.json');
  const config = existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown> : {};
  const redacted = Object.fromEntries(Object.entries(config).map(([key, value]) => [
    key,
    /(apiKey|api_key|token|secret|password)$/i.test(key) && typeof value === 'string' && value ? '<redacted>' : value,
  ]));
  out(JSON.stringify(redacted, null, 2));
}

function help(): void {
  out(`LazyBrain ${getPackageVersion()}

Usage:
  lb "task"
  lb scan
  lb compile
  lb stats
  lb discover
  lb combo "task"
  lb orchestrate "task"
  lb quickstart`);
}

async function main(): Promise<void> {
  const cmd = args[0];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return help();
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') return out(`lazybrain ${getPackageVersion()}`);
  if (cmd === 'config') return runConfig();
  if (cmd === 'find' || cmd === 'match') return runFind(queryFrom(1));
  if (cmd === 'stats') return runStats();
  if (cmd === 'discover') return runDiscover();
  if (cmd === 'combo') return runCombo(queryFrom(1));
  if (cmd === 'orchestrate') return runOrchestrate(queryFrom(1));
  if (cmd === 'scan') return runScan();
  if (cmd === 'compile') return runCompile();
  if (cmd === 'quickstart') return runQuickstart();
  return runFind(queryFrom(0));
}

main().catch((error: unknown) => {
  err(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
