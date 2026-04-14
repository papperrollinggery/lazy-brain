#!/usr/bin/env node

/**
 * LazyBrain CLI
 *
 * Usage:
 *   lazybrain scan                    Scan all capability sources
 *   lazybrain compile [--offline]     LLM-compile the knowledge graph (--offline: no LLM)
 *   lazybrain match "<query>"         Match user input to capabilities
 *   lazybrain list [--category <c>]   List all indexed capabilities
 *   lazybrain stats                   Show graph statistics
 *   lazybrain alias set <name> <target>  Set an alias
 *   lazybrain alias list              List all aliases
 *   lazybrain alias remove <name>     Remove an alias
 *   lazybrain config set <key> <val>  Set a config value
 *   lazybrain config show             Show current config
 *   lazybrain wiki                    Generate wiki articles
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAZYBRAIN_DIR, GRAPH_PATH, GRAPH_VERSION } from '../src/constants.js';
import { Graph } from '../src/graph/graph.js';
import { match } from '../src/matcher/matcher.js';
import { scan } from '../src/scanner/scanner.js';
import { compile, makeCapabilityId } from '../src/compiler/compiler.js';
import { createLLMProvider } from '../src/compiler/llm-provider.js';
import { classifyCategory } from '../src/compiler/category-classifier.js';
import { loadConfig, saveConfig, updateConfig } from '../src/config/config.js';
import { generateWiki } from '../src/graph/wiki-generator.js';
import { createEmbeddingProvider, type ApiEmbeddingConfig } from '../src/indexer/embeddings/provider.js';
import type { Capability, RawCapability, UserConfig } from '../src/types.js';

const args = process.argv.slice(2);
const cmd = args[0];

// Ensure data directory exists
if (!existsSync(LAZYBRAIN_DIR)) {
  mkdirSync(LAZYBRAIN_DIR, { recursive: true });
}

async function main() {
  switch (cmd) {
    case 'scan':
      cmdScan();
      break;
    case 'compile':
      await cmdCompile();
      break;
    case 'match':
      cmdMatch();
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
      cmdWiki();
      break;
    case 'hook':
      cmdHook();
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
      // Treat unknown non-flag args as implicit match
      if (!cmd?.startsWith('-')) {
        cmdMatch(cmd);
      } else {
        console.error(`Unknown command: ${cmd}`);
        printHelp();
        process.exit(1);
      }
  }
}

// ─── Scan ─────────────────────────────────────────────────────────────────

function cmdScan() {
  const config = loadConfig();
  console.log('Scanning capability sources...');

  const result = scan({
    extraPaths: config.scanPaths,
    onProgress: (scanned, found) => {
      process.stdout.write(`\r  Scanned ${scanned} files, found ${found} capabilities`);
    },
  });

  console.log(`\n\nScan complete:`);
  console.log(`  Paths scanned: ${result.scannedPaths}`);
  console.log(`  Files scanned: ${result.scannedFiles}`);
  console.log(`  Capabilities found: ${result.capabilities.length}`);

  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.length}`);
    for (const err of result.errors.slice(0, 5)) {
      console.log(`    - ${err}`);
    }
  }

  // Save raw scan results for compile step
  const scanCachePath = join(LAZYBRAIN_DIR, 'scan-cache.json');
  writeFileSync(scanCachePath, JSON.stringify(result.capabilities, null, 2));
  console.log(`\n  Saved to ${scanCachePath}`);
  console.log(`  Run 'lazybrain compile' to build the knowledge graph.`);
}

// ─── Compile ──────────────────────────────────────────────────────────────

async function cmdCompile() {
  const scanCachePath = join(LAZYBRAIN_DIR, 'scan-cache.json');
  if (!existsSync(scanCachePath)) {
    console.error('No scan cache found. Run `lazybrain scan` first.');
    process.exit(1);
  }

  const rawCapabilities: RawCapability[] = JSON.parse(
    readFileSync(scanCachePath, 'utf-8'),
  );
  console.log(`Compiling ${rawCapabilities.length} capabilities...`);

  const isOffline = args.includes('--offline');
  const config = loadConfig();

  if (isOffline || !config.compileApiBase) {
    // Offline mode: use category-classifier + raw triggers, no LLM
    console.log('  Mode: offline (no LLM, using rule-based classification)');
    const graph = compileOffline(rawCapabilities);
    graph.save(GRAPH_PATH);
    const s = graph.stats();
    console.log(`\nGraph built:`);
    console.log(`  Nodes: ${s.nodes}`);
    console.log(`  Categories: ${s.categories}`);
    console.log(`  By kind: ${JSON.stringify(s.byKind)}`);
    console.log(`\n  Saved to ${GRAPH_PATH}`);
    console.log(`  Run 'lazybrain match "<query>"' to test matching.`);
  } else {
    // LLM mode
    console.log(`  Mode: LLM (${config.compileModel})`);
    const llm = createLLMProvider({
      model: config.compileModel,
      apiBase: config.compileApiBase,
      apiKey: config.compileApiKey,
    });

    // Load existing graph for incremental compilation
    const existingGraph = existsSync(GRAPH_PATH) ? Graph.load(GRAPH_PATH) : undefined;

    const result = await compile(rawCapabilities, {
      llm,
      modelName: config.compileModel,
      existingGraph,
      onProgress: (current, total, name) => {
        process.stdout.write(`\r  [${current}/${total}] ${name}`);
      },
    });

    result.graph.save(GRAPH_PATH);
    console.log(`\n\nCompile complete:`);
    console.log(`  Compiled: ${result.compiled}`);
    console.log(`  Skipped (cached): ${result.skipped}`);
    console.log(`  Tokens: ${result.totalTokens.input} in / ${result.totalTokens.output} out`);
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.length}`);
      for (const err of result.errors.slice(0, 5)) {
        console.log(`    - ${err}`);
      }
    }
    const s = result.graph.stats();
    console.log(`  Nodes: ${s.nodes}, Links: ${s.links}, Categories: ${s.categories}`);
    console.log(`\n  Saved to ${GRAPH_PATH}`);
  }

  // ─── Embedding generation ──────────────────────────────────────────────
  const shouldEmbed = args.includes('--with-embeddings') || config.engine === 'embedding' || config.engine === 'hybrid';

  if (shouldEmbed) {
    const graphToEmbed = Graph.load(GRAPH_PATH);
    const allNodes = graphToEmbed.getAllNodes();
    const needsEmbedding = allNodes.filter(n => !n.embedding || n.embedding.length === 0);

    if (needsEmbedding.length > 0) {
      if (!config.embeddingApiKey) {
        console.error('  Embedding API key not set. Run: lazybrain config set embeddingApiKey <key>');
        process.exit(1);
      }
      console.log(`\nGenerating embeddings for ${needsEmbedding.length} capabilities...`);
      const embeddingConfig: ApiEmbeddingConfig = {
        apiBase: config.embeddingApiBase ?? 'https://api.siliconflow.cn/v1',
        apiKey: config.embeddingApiKey,
        model: config.embeddingModel ?? 'BAAI/bge-m3',
      };
      const provider = createEmbeddingProvider(embeddingConfig);
      const BATCH_SIZE = 32;

      for (let i = 0; i < needsEmbedding.length; i += BATCH_SIZE) {
        const batch = needsEmbedding.slice(i, i + BATCH_SIZE);
        const texts = batch.map(cap =>
          `${cap.name}: ${cap.description}. Tags: ${cap.tags.join(', ')}`
        );
        const embeddings = await provider.embedBatch(texts);

        for (let j = 0; j < batch.length; j++) {
          const node = graphToEmbed.getNode(batch[j].id);
          if (node) {
            node.embedding = embeddings[j];
          }
        }

        process.stdout.write(`\r  [${Math.min(i + BATCH_SIZE, needsEmbedding.length)}/${needsEmbedding.length}]`);
      }

      graphToEmbed.save(GRAPH_PATH);
      console.log(`\n  Embeddings saved to ${GRAPH_PATH}`);
    } else {
      console.log('\nAll capabilities already have embeddings.');
    }
  }
}

/**
 * Offline compilation: no LLM, uses rule-based category classifier
 * and raw triggers/name/description as tags.
 */
function compileOffline(rawCapabilities: RawCapability[]): Graph {
  const graph = new Graph();

  for (const raw of rawCapabilities) {
    const id = makeCapabilityId(raw.kind, raw.name, raw.origin);
    const category = classifyCategory(raw);

    // Generate basic tags from name, description, triggers
    const tags = generateOfflineTags(raw);

    // Generate basic example queries
    const exampleQueries = generateOfflineQueries(raw);

    const capability: Capability = {
      id,
      kind: raw.kind,
      name: raw.name,
      description: raw.description,
      origin: raw.origin,
      status: 'installed',
      compatibility: raw.compatibility,
      filePath: raw.filePath,
      tags,
      exampleQueries,
      category,
      triggers: raw.triggers,
      meta: raw.meta,
    };

    graph.addNode(capability);
  }

  graph.setCompileInfo('offline');
  return graph;
}

function generateOfflineTags(raw: RawCapability): string[] {
  const tags = new Set<string>();

  // From name: split on hyphens/underscores (high value)
  for (const part of raw.name.split(/[-_\s]+/)) {
    if (part.length > 1) tags.add(part.toLowerCase());
  }

  // From triggers (high value)
  if (raw.triggers) {
    for (const t of raw.triggers) {
      const cleaned = t.replace(/^[/"']|[/"']$/g, '').toLowerCase();
      if (cleaned.length > 1) tags.add(cleaned);
    }
  }

  // From description: extract meaningful words (4+ chars, aggressive stop word filter)
  const stopWords = new Set([
    // English function words
    'the', 'and', 'for', 'with', 'this', 'that', 'from', 'use', 'used',
    'when', 'you', 'your', 'are', 'not', 'but', 'all', 'can', 'has',
    'have', 'will', 'been', 'more', 'also', 'into', 'than', 'each',
    'any', 'only', 'using', 'after', 'before', 'about', 'should',
    'would', 'could', 'does', 'make', 'made', 'like', 'just', 'over',
    'such', 'take', 'other', 'some', 'them', 'then', 'these', 'those',
    'what', 'which', 'while', 'where', 'here', 'there', 'their',
    'being', 'both', 'between', 'through', 'during', 'most', 'much',
    'very', 'well', 'back', 'even', 'still', 'every', 'need', 'needs',
    'across', 'along', 'based', 'best', 'high', 'grade', 'level',
    'first', 'last', 'next', 'same', 'work', 'working', 'works',
    'including', 'includes', 'include', 'ensure', 'ensures',
    'comprehensive', 'specific', 'particular', 'general', 'common',
    'follows', 'following', 'prefer', 'directly', 'instead',
    'matters', 'asks', 'sessions', 'compounds', 'model',
    'distinctive', 'production', 'direction', 'applications',
    'persistent', 'markdown', 'knowledge', 'base',
  ]);
  const words = raw.description.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  for (const w of words) {
    if (!stopWords.has(w)) tags.add(w);
  }

  // CJK terms from description (2+ chars)
  const cjkTerms = raw.description.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  for (const t of cjkTerms) {
    tags.add(t);
  }

  return [...tags].slice(0, 15);
}

function generateOfflineQueries(raw: RawCapability): string[] {
  const queries: string[] = [];

  // Basic query patterns
  queries.push(raw.name);
  if (raw.description.length <= 80) {
    queries.push(raw.description);
  }

  // From triggers
  if (raw.triggers) {
    for (const t of raw.triggers) {
      const cleaned = t.replace(/^[/"']|[/"']$/g, '');
      if (cleaned.length > 2) queries.push(cleaned);
    }
  }

  return queries.slice(0, 5);
}

// ─── Match ────────────────────────────────────────────────────────────────

async function cmdMatch(implicitQuery?: string) {
  const query = implicitQuery ?? args[1];
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

  const embeddingProvider = (config.engine === 'embedding' || config.engine === 'hybrid') && config.embeddingApiKey
    ? createEmbeddingProvider({
        apiBase: config.embeddingApiBase ?? 'https://api.siliconflow.cn/v1',
        apiKey: config.embeddingApiKey,
        model: config.embeddingModel ?? 'BAAI/bge-m3',
      })
    : undefined;

  const result = await match(query, { graph, config, embeddingProvider });

  if (result.matches.length === 0) {
    console.log(`No matches for "${query}".`);
    return;
  }

  console.log(`\n${result.matches.length} match(es) for "${query}"\n`);

  for (const [i, m] of result.matches.entries()) {
    const pct = Math.round(m.score * 100);
    const origin = m.capability.origin ? ` [${m.capability.origin}]` : '';
    console.log(`  [${i + 1}] ${m.capability.name} (${pct}%)${origin}`);
    console.log(`      ${m.capability.description}`);
    if (m.capability.scenario) {
      console.log(`      Scenario: ${m.capability.scenario}`);
    }
    console.log(`      Category: ${m.capability.category} | ${m.capability.compatibility.join(', ')}`);
    console.log();
  }

  if (result.comparisons.length > 0) {
    console.log('  Comparisons:');
    for (const c of result.comparisons) {
      console.log(`    ${c.a.name} vs ${c.b.name}: ${c.diff}`);
    }
    console.log();
  }

  if (result.compositions.length > 0) {
    console.log('  Recommended combos:');
    for (const c of result.compositions) {
      const names = c.capabilities.map((cap: { name: string }) => cap.name).join(' + ');
      console.log(`    ${names} — ${c.reason}`);
    }
    console.log();
  }

  if (result.upgrades.length > 0) {
    console.log('  Version hints:');
    for (const u of result.upgrades) {
      console.log(`    ${u.old.name} -> ${u.new.name}`);
    }
    console.log();
  }

  if (result.external.length > 0) {
    console.log('  Available (not installed):');
    for (const e of result.external) {
      const stars = e.capability.meta?.stars ? ` (${e.capability.meta.stars} stars)` : '';
      console.log(`    ${e.capability.name}${stars} — ${e.capability.description}`);
    }
    console.log();
  }
}

// ─── List ─────────────────────────────────────────────────────────────────

function cmdList() {
  if (!existsSync(GRAPH_PATH)) {
    console.error('No graph found. Run `lazybrain scan && lazybrain compile` first.');
    process.exit(1);
  }
  const graph = Graph.load(GRAPH_PATH);
  const nodes = graph.getAllNodes();

  const filterCategory = args.indexOf('--category') !== -1
    ? args[args.indexOf('--category') + 1]
    : undefined;

  // Group by category
  const byCategory = new Map<string, typeof nodes>();
  for (const n of nodes) {
    if (filterCategory && n.category !== filterCategory) continue;
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

// ─── Stats ────────────────────────────────────────────────────────────────

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
  console.log(`  By kind:`);
  for (const [k, v] of Object.entries(s.byKind)) {
    console.log(`    ${k}: ${v}`);
  }
  console.log(`  By status:`);
  for (const [k, v] of Object.entries(s.byStatus)) {
    console.log(`    ${k}: ${v}`);
  }
}

// ─── Alias ────────────────────────────────────────────────────────────────

function cmdAlias() {
  const sub = args[1];
  const config = loadConfig();

  switch (sub) {
    case 'set': {
      const name = args[2];
      const target = args[3];
      if (!name || !target) {
        console.error('Usage: lazybrain alias set <name> <target>');
        process.exit(1);
      }
      config.aliases[name] = target;
      saveConfig(config);
      console.log(`Alias set: "${name}" -> "${target}"`);
      break;
    }
    case 'list': {
      const entries = Object.entries(config.aliases);
      if (entries.length === 0) {
        console.log('No aliases configured.');
      } else {
        console.log('\nAliases:');
        for (const [k, v] of entries) {
          console.log(`  "${k}" -> "${v}"`);
        }
      }
      break;
    }
    case 'remove': {
      const name = args[2];
      if (!name) {
        console.error('Usage: lazybrain alias remove <name>');
        process.exit(1);
      }
      if (config.aliases[name]) {
        delete config.aliases[name];
        saveConfig(config);
        console.log(`Alias removed: "${name}"`);
      } else {
        console.log(`Alias "${name}" not found.`);
      }
      break;
    }
    default:
      console.error('Usage: lazybrain alias [set|list|remove]');
      process.exit(1);
  }
}

// ─── Config ───────────────────────────────────────────────────────────────

function cmdConfig() {
  const sub = args[1];

  switch (sub) {
    case 'set': {
      const key = args[2];
      const value = args[3];
      if (!key || value === undefined) {
        console.error('Usage: lazybrain config set <key> <value>');
        process.exit(1);
      }
      // Try to parse as JSON for booleans/numbers
      let parsed: unknown = value;
      try { parsed = JSON.parse(value); } catch { /* keep as string */ }
      updateConfig(key, parsed);
      console.log(`Config set: ${key} = ${JSON.stringify(parsed)}`);
      break;
    }
    case 'show': {
      const config = loadConfig();
      console.log(JSON.stringify(config, null, 2));
      break;
    }
    default:
      console.error('Usage: lazybrain config [set|show]');
      process.exit(1);
  }
}

// ─── Wiki ─────────────────────────────────────────────────────────────────

function cmdWiki() {
  if (!existsSync(GRAPH_PATH)) {
    console.error('No graph found. Run `lazybrain scan && lazybrain compile` first.');
    process.exit(1);
  }
  const graph = Graph.load(GRAPH_PATH);
  const result = generateWiki(graph);
  console.log(`Wiki generated: ${result.articlesWritten} articles`);
  console.log(`  Index: ${result.indexPath}`);
}

// ─── Hook ─────────────────────────────────────────────────────────────────

function cmdHook() {
  const sub = args[1];
  const settingsPath = join(
    process.env.CLAUDE_CONFIG_DIR ?? join(process.env.HOME ?? '~', '.claude'),
    'settings.json',
  );

  // Resolve the hook script path from this binary's location
  const binDir = dirname(fileURLToPath(import.meta.url));
  const hookScript = resolve(binDir, 'hook.js');

  switch (sub) {
    case 'install': {
      if (!existsSync(hookScript)) {
        console.error(`Hook script not found: ${hookScript}`);
        console.error('Run `npm run build` first.');
        process.exit(1);
      }

      let settings: Record<string, unknown> = {};
      if (existsSync(settingsPath)) {
        try {
          settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
        } catch {
          console.error(`Failed to parse ${settingsPath}`);
          process.exit(1);
        }
      }

      const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
      const existing = (hooks.UserPromptSubmit ?? []) as Array<Record<string, unknown>>;

      // Remove any existing lazybrain hook
      const filtered = existing.filter(
        (h) => !(typeof h.command === 'string' && h.command.includes('lazybrain')),
      );

      filtered.push({
        matcher: '',
        hooks: [{ type: 'command', command: `node ${hookScript}` }],
      });

      hooks.UserPromptSubmit = filtered;
      settings.hooks = hooks;

      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log(`Hook installed: ${settingsPath}`);
      console.log(`  Script: ${hookScript}`);
      console.log(`  Restart Claude Code to activate.`);
      break;
    }
    case 'uninstall': {
      if (!existsSync(settingsPath)) {
        console.log('No settings file found.');
        return;
      }
      let settings: Record<string, unknown> = {};
      try {
        settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
      } catch {
        console.error(`Failed to parse ${settingsPath}`);
        process.exit(1);
      }

      const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
      const existing = (hooks.UserPromptSubmit ?? []) as Array<Record<string, unknown>>;
      hooks.UserPromptSubmit = existing.filter(
        (h) => !(typeof h.command === 'string' && h.command.includes('lazybrain')),
      );
      settings.hooks = hooks;

      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log('Hook uninstalled.');
      break;
    }
    default:
      console.error('Usage: lazybrain hook [install|uninstall]');
      process.exit(1);
  }
}

// ─── Help ─────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
lazybrain — Semantic skill router for AI coding agents

Usage:
  lazybrain scan                     Scan capability sources
  lazybrain compile [--offline]      Build knowledge graph (--offline: no LLM)
  lazybrain match "<query>"          Match input to capabilities
  lazybrain list [--category <c>]    List indexed capabilities
  lazybrain stats                    Show graph statistics
  lazybrain alias set <n> <target>   Set an alias
  lazybrain alias list               List aliases
  lazybrain alias remove <name>      Remove an alias
  lazybrain config set <key> <val>   Set config value
  lazybrain config show              Show config
  lazybrain wiki                     Generate wiki articles
  lazybrain --version                Show version
`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
