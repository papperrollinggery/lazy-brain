#!/usr/bin/env node

import { append, getStats } from '../src/history/history.js';
import { readCatalog, catalogEvidence } from '../src/catalog/catalog.js';
import { GRAPH_PATH, LAZYBRAIN_DIR } from '../src/constants.js';
import { find } from '../src/matcher/matcher.js';
import { handleRequest } from '../src/mcp/server.js';
import { getPackageVersion } from '../src/version.js';
import type { Platform } from '../src/types.js';

const args = process.argv.slice(2);

function out(text: string): void {
  process.stdout.write(text.endsWith('\n') ? text : text + '\n');
}

interface ParsedArguments {
  query: string;
  json: boolean;
  visualizePrompt: boolean;
  options: Record<string, unknown>;
}

function parseArguments(values: string[]): ParsedArguments {
  const positional: string[] = [];
  const options: Record<string, unknown> = { cwd: process.cwd() };
  let json = false;
  let visualizePrompt = false;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === '--') { positional.push(...values.slice(i + 1)); break; }
    if (value === '--json') { json = true; continue; }
    if (value === '--visualize-prompt') { visualizePrompt = true; continue; }
    if (value === '--refresh') { options.refresh = true; continue; }
    if (value === '--offline') continue; // Compilation is always local.
    if (['--cwd', '--platform', '--kind', '--limit', '--offset'].includes(value)) {
      const next = values[++i];
      if (!next || next.startsWith('--')) throw new Error(value + ' needs a value.');
      options[value.slice(2)] = value === '--limit' || value === '--offset' ? Number(next) : next;
      continue;
    }
    if (value.startsWith('--')) throw new Error('Unknown option: ' + value);
    positional.push(value);
  }
  return { query: positional.join(' ').trim(), json, visualizePrompt, options };
}

function callTool(name: string, input: ParsedArguments, extra: Record<string, unknown> = {}): void {
  const response = handleRequest({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name, arguments: { ...input.options, ...(input.query ? { query: input.query } : {}), ...extra } },
  });
  const result = response?.result as {
    content?: Array<{ text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  } | undefined;
  if (response?.error || result?.isError) throw new Error(response?.error?.message ?? result?.content?.[0]?.text ?? 'Tool failed.');
  if (input.visualizePrompt) {
    const payload = result?.structuredContent?.desktopVisualization as { visualizePrompt?: string } | undefined;
    out(payload?.visualizePrompt ?? 'No visualization payload requested.');
  } else {
    out(input.json ? JSON.stringify(result?.structuredContent ?? {}, null, 2) : result?.content?.map((item) => item.text).join('\n') ?? '');
  }
}

function runUse(values: string[]): void {
  const selected = (values[0] ?? '').replace(/^\//, '').trim();
  if (!selected || selected.startsWith('--')) throw new Error('Usage: lb use <capability-name> [task description]');
  append({
    timestamp: new Date().toISOString(), query: values.slice(1).join(' ').trim(),
    recommended: selected, used: selected,
    sessionId: process.env.CODEX_THREAD_ID ?? process.env.CLAUDE_SESSION_ID ?? 'manual',
  });
  out('Recorded your adoption report for ' + selected + '. This does not execute or verify the capability.');
}

function runStats(json: boolean): void {
  const stats = getStats();
  const report = { windowDays: 30, adoptionReports: stats.accepted,
    legacyUnacceptedRecommendations: stats.ignored, bySkill: stats.bySkill };
  out(json ? JSON.stringify(report, null, 2) : [
    'Explicit adoption reports in the last 30 days: ' + stats.accepted,
    ...stats.bySkill.slice(0, 10).map((item) => item.skill + ': ' + item.count),
    'Unaccepted legacy recommendations are excluded from use counts.',
  ].join('\n'));
}

function snapshotFor(input: ParsedArguments) {
  const platform = input.options.platform ?? 'codex';
  if (!['codex', 'claude-code', 'cursor', 'opencode'].includes(String(platform))) {
    throw new Error('Unsupported platform.');
  }
  return readCatalog({ cwd: String(input.options.cwd), platform: platform as Platform, refresh: input.options.refresh === true });
}

function runCompile(input: ParsedArguments): void {
  const snapshot = snapshotFor(input);
  if (snapshot.errors.length) throw new Error('Scan is incomplete; preserving the existing snapshot. ' + snapshot.errors.join('\n'));
  snapshot.graph.save(GRAPH_PATH);
  const report = { ...catalogEvidence(snapshot), snapshotPath: GRAPH_PATH };
  out(input.json ? JSON.stringify(report, null, 2) : 'Saved ' + snapshot.graph.getNodeCount() + ' metadata entries to ' + GRAPH_PATH + '. No model or tool execution was tested.');
}

function runReady(input: ParsedArguments): void {
  const snapshot = snapshotFor(input);
  const usable = snapshot.graph.getAllNodes().filter((item) => item.status === 'installed').length;
  const status = snapshot.errors.length ? 'PARTIAL' : usable ? 'METADATA_AVAILABLE' : 'EMPTY';
  out(input.json ? JSON.stringify({ status, ...catalogEvidence(snapshot) }, null, 2) : status);
}

function runDemo(input: ParsedArguments): void {
  if (!input.query) throw new Error('Usage: lb demo "task" [--json]');
  const matches = find(input.query, { includeBuiltins: true, limit: 3 });
  const report = { illustrativeOnly: true, installedVerified: false, matches };
  out(input.json ? JSON.stringify(report, null, 2) :
    'Built-in examples only; these are not installed capabilities.\n' +
      matches.map((item) => item.skill + ' — ' + item.description).join('\n'));
}

function help(): void {
  out([
    'LazyBrain ' + getPackageVersion() + ' — local capability lookup for Codex',
    '',
    'Use the host’s known tools and Skills directly. Search here when local discovery is unresolved.',
    '',
    '  lb find "task" [--json]',
    '  lb catalog [keywords] [--kind skill] [--limit 20] [--offset 0] [--json]',
    '  lb scan [--json]                 Read metadata; write nothing',
    '  lb compile [--json]              Save an optional local metadata snapshot',
    '  lb ready [--json]                Report metadata availability, not tool readiness',
    '  lb use <name> [task]             Record explicit adoption; does not execute',
    '  lb stats [--json]',
    '  lb desktop "task" [--json|--visualize-prompt]  Optional comparison payload',
    '  lb demo "task" [--json]          Illustrative built-in recipes',
    '',
    'Search options: --cwd /absolute/project --platform codex --refresh',
    'Aliases: lb "task", ask, recommend, match. quickstart is a read-only first check.',
  ].join('\n'));
}

function main(): void {
  const command = args[0];
  if (!command || ['help', '--help', '-h'].includes(command)) return help();
  if (['--version', '-v', 'version'].includes(command)) return out('lazybrain ' + getPackageVersion());
  if (['use', 'accept'].includes(command)) return runUse(args.slice(1));
  if (command === 'hook') {
    out('Automatic routing hooks are retired. Codex discovers the Skill natively; existing hook.js registrations now continue without injection or writes.');
    if (args[1] === 'install') process.exitCode = 1;
    return;
  }
  if (command === 'config') {
    if (args[1] !== 'show') throw new Error('Usage: lb config show');
    return out(JSON.stringify({ dataDirectory: LAZYBRAIN_DIR, matching: 'local metadata',
      modelOverride: false, history: 'explicit adoption only' }, null, 2));
  }
  const known = ['find', 'match', 'ask', 'recommend', 'catalog', 'scan', 'compile', 'quickstart',
    'ready', 'stats', 'discover', 'desktop', 'visualize', 'demo', 'combo', 'orchestrate', 'rules'];
  const input = parseArguments(known.includes(command) ? args.slice(1) : args);
  if (command === 'stats') return runStats(input.json);
  if (command === 'compile') return runCompile(input);
  if (command === 'ready') return runReady(input);
  if (command === 'demo') return runDemo(input);
  if (command === 'rules') return out('Automatic orchestration is retired. Use the host to choose a workflow from the selected Skills.');
  if (['combo', 'orchestrate'].includes(command)) {
    if (!input.json) out('Workflow selection belongs to the host. Relevant local entries:');
    return callTool('lazybrain_recommend', input);
  }
  if (['catalog', 'scan', 'quickstart', 'discover'].includes(command)) return callTool('lazybrain_catalog', input);
  return callTool('lazybrain_recommend', input, ['desktop', 'visualize'].includes(command) ? { visualize: true } : {});
}

try { main(); }
catch (error) {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
  process.exitCode = 1;
}
