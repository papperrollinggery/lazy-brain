#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
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
import { loadRules } from '../src/orchestrator/rules.js';
import { signalFromQuery } from '../src/orchestrator/signals.js';
import { userRuleTemplate } from '../src/orchestrator/user-rules.js';
import { box, bold, cyan, dim, green, highlight, progressBar, yellow } from '../src/ui/terminal.js';
import type { Capability, RawCapability } from '../src/types.js';
import { getPackageVersion } from '../src/version.js';
import { dirname, join } from 'node:path';

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

function jsonFlag(): boolean {
  return args.includes('--json');
}

function projectHooksPath(): string {
  return join(process.cwd(), '.claude', 'hooks', 'hooks.json');
}

function currentHookPath(): string {
  const executable = realpathSync(process.argv[1]);
  return join(dirname(executable), 'hook.js');
}

function hookCommand(): string {
  return `node ${JSON.stringify(currentHookPath())}`;
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const value = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function hookEntries(config: Record<string, unknown>): unknown[] {
  const hooks = config.hooks;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return [];
  const entries = (hooks as Record<string, unknown>).UserPromptSubmit;
  return Array.isArray(entries) ? entries : [];
}

function normalizeHookText(entry: unknown): string {
  return JSON.stringify(entry).replace(/\\\\/g, '/').replace(/\\?["']/g, '');
}

function isLazybrainHookEntry(entry: unknown): boolean {
  const normalized = normalizeHookText(entry);
  const current = currentHookPath().replace(/\\/g, '/');
  return normalized.includes(current) || (/lazybrain/i.test(normalized) && /\/(?:dist\/)?bin\/hook\.js\b/.test(normalized));
}

function lazybrainHookCount(config: Record<string, unknown>): number {
  return hookEntries(config).filter(isLazybrainHookEntry).length;
}

function hookRegistration(command: string): Record<string, unknown> {
  return {
    matcher: '',
    hooks: [
      {
        type: 'command',
        command,
        timeout: 5,
      },
    ],
  };
}

function withoutLazybrainHooks(entries: unknown[]): unknown[] {
  return entries.filter((entry) => !isLazybrainHookEntry(entry));
}

function writeHooksConfig(path: string, config: Record<string, unknown>, entries: unknown[]): void {
  const hooks = config.hooks && typeof config.hooks === 'object' && !Array.isArray(config.hooks)
    ? config.hooks as Record<string, unknown>
    : {};
  hooks.UserPromptSubmit = entries;
  const next = {
    ...config,
    hooks,
    $schema: typeof config.$schema === 'string' ? config.$schema : 'https://json.schemastore.org/claude-code-settings.json',
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
}

function hookStatus(): { installed: boolean; count: number; path: string; command: string } {
  const path = projectHooksPath();
  const config = readJsonObject(path);
  const count = lazybrainHookCount(config);
  return { installed: count > 0, count, path, command: hookCommand() };
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
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const recentSkill = (entry: { used: string | null; recommended: string }) => entry.used ?? entry.recommended;
  const weekOne = new Set(stats.recent.filter((entry) => Date.parse(entry.timestamp) >= now - weekMs).map(recentSkill)).size;
  const weekFour = new Set(stats.recent.filter((entry) => Date.parse(entry.timestamp) < now - (3 * weekMs)).map(recentSkill)).size;
  const patterns = detectPatterns(stats.recent);
  const neverTried = unusedHighValue(stats.recent);
  const lines = [
    bold('📊 Your AI Enhancement Usage (30 days)'),
    '',
    `Total queries: ${stats.total}   Accepted: ${stats.accepted}   Ignored: ${stats.ignored}`,
    `Growth: Week 1 ${weekOne} skills vs Week 4 ${weekFour} skills`,
    `Estimated time saved: ${stats.accepted * 3} minutes`,
    '',
    'Most activated',
    ...stats.bySkill.slice(0, 6).map((item) => `/${item.skill} ${progressBar(item.count, max)} ${item.count}x`),
  ];
  if (patterns.length) {
    lines.push('', 'Combos used');
    for (const pattern of patterns.slice(0, 3)) lines.push(`${pattern.sequence.join(' → ')} (${pattern.count}x)`);
  }
  if (neverTried.length) lines.push('', `Never tried: ${neverTried.map((skill) => `/${skill}`).join(', ')}`);
  out(box(lines));
}

function runRules(): void {
  if (args[1] === 'add') {
    out(userRuleTemplate());
    return;
  }
  const rules = loadRules();
  out(box([
    bold('Active orchestration rules'),
    '',
    ...rules.map((rule) => `${rule.name} ${progressBar(rule.confidence, 1, 10)} ${Math.round(rule.confidence * 100)}%`),
    '',
    `Add custom rule: ${cyan('lb rules add')} >> ~/.lazybrain/rules.yaml`,
  ], { title: 'rules' }));
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

function runReady(): void {
  const graph = loadGraphIfPresent();
  const nodes = graph?.getNodeCount() ?? 0;
  const ready = nodes > 0;
  if (jsonFlag()) {
    out(JSON.stringify({
      status: ready ? 'READY' : 'NOT_READY',
      graphExists: existsSync(GRAPH_PATH),
      nodeCount: nodes,
      hook: hookStatus(),
    }, null, 2));
    return;
  }
  out(ready ? 'READY' : 'NOT_READY');
}

function runHook(): void {
  const action = args[1] ?? 'status';
  const status = hookStatus();
  if (action === 'status') {
    if (jsonFlag()) {
      out(JSON.stringify(status, null, 2));
      return;
    }
    out(status.installed ? `LazyBrain hook installed (${status.count}) at ${status.path}` : `LazyBrain hook not installed at ${status.path}`);
    return;
  }
  if (action === 'plan') {
    const plan = {
      title: 'LazyBrain hook plan',
      path: status.path,
      command: status.command,
      action: status.installed ? 'dedupe existing UserPromptSubmit hook' : 'install UserPromptSubmit hook',
    };
    if (jsonFlag()) {
      out(JSON.stringify(plan, null, 2));
      return;
    }
    out(box([
      bold('LazyBrain hook plan'),
      '',
      `Path: ${plan.path}`,
      `Command: ${plan.command}`,
      `Action: ${plan.action}`,
    ], { title: 'hook plan' }));
    return;
  }
  if (action === 'install') {
    const path = projectHooksPath();
    const config = readJsonObject(path);
    const entries = [...withoutLazybrainHooks(hookEntries(config)), hookRegistration(hookCommand())];
    writeHooksConfig(path, config, entries);
    out(jsonFlag() ? JSON.stringify(hookStatus(), null, 2) : `LazyBrain hook installed at ${path}`);
    return;
  }
  if (action === 'uninstall' || action === 'rollback') {
    const path = projectHooksPath();
    const config = readJsonObject(path);
    writeHooksConfig(path, config, withoutLazybrainHooks(hookEntries(config)));
    out(jsonFlag() ? JSON.stringify(hookStatus(), null, 2) : `LazyBrain hook removed from ${path}`);
    return;
  }
  out('Usage: lb hook status|plan|install|uninstall|rollback [--json]');
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
  lb rules
  lb quickstart
  lb ready
  lb hook status|plan|install|uninstall|rollback`);
}

async function main(): Promise<void> {
  const cmd = args[0];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return help();
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') return out(`lazybrain ${getPackageVersion()}`);
  if (cmd === 'config') return runConfig();
  if (cmd === 'ready') return runReady();
  if (cmd === 'hook') return runHook();
  if (cmd === 'find' || cmd === 'match') return runFind(queryFrom(1));
  if (cmd === 'stats') return runStats();
  if (cmd === 'discover') return runDiscover();
  if (cmd === 'combo') return runCombo(queryFrom(1));
  if (cmd === 'orchestrate') return runOrchestrate(queryFrom(1));
  if (cmd === 'rules') return runRules();
  if (cmd === 'scan') return runScan();
  if (cmd === 'compile') return runCompile();
  if (cmd === 'quickstart') return runQuickstart();
  return runFind(queryFrom(0));
}

main().catch((error: unknown) => {
  err(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
