#!/usr/bin/env node

/**
 * LazyBrain CLI
 *
 * Usage:
 *   lazybrain scan                    Scan all capability sources
 *   lazybrain compile                 LLM-compile the knowledge graph
 *   lazybrain match "<query>"         Match user input to capabilities
 *   lazybrain list                    List all indexed capabilities
 *   lazybrain stats                   Show graph statistics
 *   lazybrain alias set <name> <target>  Set an alias
 *   lazybrain alias list              List all aliases
 *   lazybrain alias remove <name>     Remove an alias
 *   lazybrain config set <key> <val>  Set a config value
 *   lazybrain config show             Show current config
 *   lazybrain wiki                    Generate wiki articles
 *   lazybrain hook install            Install Claude Code hook
 *   lazybrain hook uninstall          Remove Claude Code hook
 */

import { existsSync, mkdirSync } from 'node:fs';
import { LAZYBRAIN_DIR, GRAPH_PATH, DEFAULT_CONFIG } from '../src/constants.js';
import { Graph } from '../src/graph/graph.js';
import { match } from '../src/matcher/matcher.js';
import type { UserConfig } from '../src/types.js';

const args = process.argv.slice(2);
const cmd = args[0];

// Ensure data directory exists
if (!existsSync(LAZYBRAIN_DIR)) {
  mkdirSync(LAZYBRAIN_DIR, { recursive: true });
}

async function main() {
  switch (cmd) {
    case 'scan':
      await cmdScan();
      break;
    case 'compile':
      await cmdCompile();
      break;
    case 'match':
      await cmdMatch();
      break;
    case 'list':
      cmdList();
      break;
    case 'stats':
      cmdStats();
      break;
    case 'alias':
      cmdAlias();
      break;
    case 'config':
      cmdConfig();
      break;
    case 'wiki':
      await cmdWiki();
      break;
    case '--version':
    case '-v':
      console.log('lazybrain 0.1.0');
      break;
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;
    default:
      // If no command, treat as implicit match
      if (!cmd?.startsWith('-')) {
        args.unshift('match');
        await cmdMatch();
      } else {
        console.error(`Unknown command: ${cmd}`);
        printHelp();
        process.exit(1);
      }
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────

async function cmdScan() {
  // Delegate to scanner (MiniMax will implement)
  console.log('Scanning capability sources...');
  console.log('TODO: Scanner implementation pending (MiniMax task)');
}

async function cmdCompile() {
  console.log('Compiling knowledge graph...');
  console.log('TODO: Full compile pipeline pending (requires scanner + LLM)');
}

async function cmdMatch() {
  const query = args[1];
  if (!query) {
    console.error('Usage: lazybrain match "<query>"');
    process.exit(1);
  }

  if (!existsSync(GRAPH_PATH)) {
    console.error('No graph found. Run `lazybrain scan && lazybrain compile` first.');
    process.exit(1);
  }

  const graph = Graph.load(GRAPH_PATH);
  const config = loadConfig();

  const result = match(query, { graph, config });

  // Format output
  if (result.matches.length === 0) {
    console.log('No matching capabilities found.');
    return;
  }

  console.log(`\nLazyBrain: ${result.matches.length} match(es) for "${query}"\n`);

  for (const [i, m] of result.matches.entries()) {
    const pct = Math.round(m.score * 100);
    const origin = m.capability.origin ? ` [${m.capability.origin}]` : '';
    const platform = m.capability.compatibility.join(', ');
    console.log(`  [${i + 1}] ${m.capability.name} (${pct}%)${origin}`);
    console.log(`      ${m.capability.description}`);
    if (m.capability.scenario) {
      console.log(`      场景: ${m.capability.scenario}`);
    }
    console.log(`      平台: ${platform}`);
    console.log();
  }

  // Show comparisons
  if (result.comparisons.length > 0) {
    console.log('  对比:');
    for (const c of result.comparisons) {
      console.log(`    ${c.a.name} vs ${c.b.name}: ${c.diff}`);
    }
    console.log();
  }

  // Show compositions
  if (result.compositions.length > 0) {
    console.log('  推荐组合:');
    for (const c of result.compositions) {
      const names = c.capabilities.map((cap: { name: string }) => cap.name).join(' + ');
      console.log(`    ${names} — ${c.reason}`);
    }
    console.log();
  }

  // Show upgrades
  if (result.upgrades.length > 0) {
    console.log('  版本提示:');
    for (const u of result.upgrades) {
      console.log(`    ⬆ ${u.old.name} → ${u.new.name}`);
    }
    console.log();
  }

  // Show external
  if (result.external.length > 0) {
    console.log('  未安装但可用:');
    for (const e of result.external) {
      const stars = e.capability.meta?.stars ? ` (⭐ ${e.capability.meta.stars})` : '';
      console.log(`    ${e.capability.name}${stars} — ${e.capability.description}`);
    }
    console.log();
  }
}

function cmdList() {
  if (!existsSync(GRAPH_PATH)) {
    console.error('No graph found. Run `lazybrain scan && lazybrain compile` first.');
    process.exit(1);
  }
  const graph = Graph.load(GRAPH_PATH);
  const nodes = graph.getAllNodes();

  // Group by category
  const byCategory = new Map<string, typeof nodes>();
  for (const n of nodes) {
    const cat = n.category || 'other';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(n);
  }

  for (const [cat, caps] of [...byCategory.entries()].sort((a: [string, unknown[]], b: [string, unknown[]]) => a[0].localeCompare(b[0]))) {
    console.log(`\n${cat} (${caps.length}):`);
    for (const c of caps.sort((a, b) => a.name.localeCompare(b.name))) {
      const status = c.status === 'disabled' ? ' [disabled]' : '';
      console.log(`  ${c.kind}/${c.name}${status} — ${c.description.slice(0, 60)}`);
    }
  }
}

function cmdStats() {
  if (!existsSync(GRAPH_PATH)) {
    console.error('No graph found.');
    process.exit(1);
  }
  const graph = Graph.load(GRAPH_PATH);
  const s = graph.stats();
  console.log(`\nLazyBrain Graph Stats:`);
  console.log(`  Nodes: ${s.nodes}`);
  console.log(`  Links: ${s.links}`);
  console.log(`  Categories: ${s.categories}`);
  console.log(`  By kind: ${JSON.stringify(s.byKind)}`);
  console.log(`  By status: ${JSON.stringify(s.byStatus)}`);
}

function cmdAlias() {
  console.log('TODO: Alias management pending (MiniMax task)');
}

function cmdConfig() {
  console.log('TODO: Config management pending (MiniMax task)');
}

async function cmdWiki() {
  console.log('TODO: Wiki generation pending (MiniMax task)');
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function loadConfig(): UserConfig {
  // TODO: load from CONFIG_PATH, merge with defaults
  return { ...DEFAULT_CONFIG };
}

function printHelp() {
  console.log(`
lazybrain — Semantic skill router for AI coding agents

Usage:
  lazybrain scan                     Scan capability sources
  lazybrain compile                  LLM-compile the knowledge graph
  lazybrain match "<query>"          Match input to capabilities
  lazybrain list                     List all indexed capabilities
  lazybrain stats                    Show graph statistics
  lazybrain alias set <n> <target>   Set an alias
  lazybrain alias list               List aliases
  lazybrain alias remove <name>      Remove an alias
  lazybrain config set <key> <val>   Set config value
  lazybrain config show              Show config
  lazybrain wiki                     Generate wiki articles
  lazybrain hook install             Install Claude Code hook
  lazybrain --version                Show version
`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
