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

import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAZYBRAIN_DIR, GRAPH_PATH, GRAPH_VERSION, STATUS_PATH, HISTORY_PATH, getStatuslineChainPath } from '../src/constants.js';
import { Graph } from '../src/graph/graph.js';
import { match } from '../src/matcher/matcher.js';
import { recommendTeam } from '../src/matcher/team-recommender.js';
import { scan } from '../src/scanner/scanner.js';
import { compile, makeCapabilityId } from '../src/compiler/compiler.js';
import { createLLMProvider } from '../src/compiler/llm-provider.js';
import { classifyCategory } from '../src/compiler/category-classifier.js';
import { loadConfig, saveConfig, updateConfig } from '../src/config/config.js';
import { generateWiki } from '../src/graph/wiki-generator.js';
import { createProgressBar } from '../src/utils/progress.js';
import { loadRecentHistory } from '../src/history/history.js';
import { distillAndSave, loadProfile } from '../src/history/profile.js';
import { evolveCapabilities } from '../src/evolution/evolve.js';
import { generateReport, computeWeeklyStats, formatWeeklyReport } from '../src/history/accuracy-report.js';
import { detectDuplicates, findCapabilityByNameOrId, compareCapabilities } from '../src/graph/duplicate-detector.js';
import { buildGraphView, formatGraphMermaid } from '../src/graph/graph-view.js';
import { createServer, isServerRunning, getServerPort, getServerPid, DEFAULT_PORT } from '../src/server/server.js';
import { execFileSync, spawn } from 'node:child_process';
import type { Capability, RawCapability, UserConfig } from '../src/types.js';
import { buildSessionSummary, formatSessionSummary } from '../src/stats/session-summary.js';
import {
  hasLazyBrainHookRegistration,
  isLazyBrainHookCommand,
  removeLazyBrainHookRegistrations,
  upsertLazyBrainUserPromptSubmit,
} from '../src/hook/settings.js';
import { getHookLifecycleStatus, loadLatestStopHookAudit } from '../src/hook/status.js';
import { clearHookInstallState, readHookInstallState, writeHookInstallState } from '../src/hook/install-state.js';
import { cleanHookRuntimeRecords, clearHookBreaker, getHookRuntimeSnapshot, getHookRuntimeStats } from '../src/hook/runtime.js';
import type { HookInstallScope, HookStatuslineMode } from '../src/hook/types.js';

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
    case 'find':
      cmdMatch();
      break;
    case 'list':
      cmdList();
      break;
    case 'stats':
      cmdStats();
      break;
    case 'graph':
      cmdGraph();
      break;
    case 'alias':
      cmdAlias();
      break;
    case 'suggest-aliases':
      cmdSuggestAliases();
      break;
    case 'config':
      cmdConfig();
      break;
    case 'wiki':
      cmdWiki();
      break;
    case 'distill':
      cmdDistill();
      break;
    case 'evolve':
      cmdEvolve();
      break;
    case 'hook':
      cmdHook();
      break;
    case 'doctor':
      cmdDoctor();
      break;
    case 'team':
      cmdTeam();
      break;
    case 'dups':
      cmdDups();
      break;
    case 'compare':
      cmdCompare();
      break;
    case 'server':
      await cmdServer();
      break;
    case 'report':
      cmdReport();
      break;
    case 'summary':
      cmdSummary();
      break;
    case '--version':
    case '-v':
      console.log('lazybrain 1.0.0');
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
  writeFileSync(STATUS_PATH, JSON.stringify({ state: 'scanning', updatedAt: Date.now() }));
  console.log('Scanning capability sources...');

  // --platform <name>: scan specific platform only
  let platforms = config.platforms;
  if (args.includes('--platform')) {
    const pIdx = args.indexOf('--platform');
    const targetPlatform = args[pIdx + 1];
    platforms = { [targetPlatform]: true } as Record<string, boolean>;
    console.log(`  Platform filter: ${targetPlatform}`);
  }

  const result = scan({
    extraPaths: config.scanPaths,
    platform: config.platform ?? 'claude-code',
    platforms,
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

  // Increment scan: compare old vs new
  const oldCache: RawCapability[] = existsSync(scanCachePath)
    ? (() => { try { return JSON.parse(readFileSync(scanCachePath, 'utf-8')); } catch { return []; } })()
    : [];
  const oldKey = (c: RawCapability) => `${c.origin}:${c.kind}:${c.name}`;
  const oldKeys = new Set(oldCache.map(oldKey));
  const newOnes = result.capabilities.filter((c: RawCapability) => !oldKeys.has(oldKey(c)));
  const removed = oldCache.filter((c: RawCapability) => !result.capabilities.find((n: RawCapability) => oldKey(n) === oldKey(c)));

  writeFileSync(scanCachePath, JSON.stringify(result.capabilities, null, 2));

  // Output increment info
  if (newOnes.length > 0) {
    console.log(`\n  🆕 新增 ${newOnes.length} 个工具:`);
    for (const c of newOnes.slice(0, 5)) console.log(`    + ${c.name}`);
    if (newOnes.length > 5) console.log(`    ... 还有 ${newOnes.length - 5} 个`);
  }
  if (removed.length > 0) {
    console.log(`\n  🗑  移除 ${removed.length} 个工具`);
  }
  console.log(`\n  Saved to ${scanCachePath}`);
  console.log(`  Run 'lazybrain compile' to build the knowledge graph.`);
  writeFileSync(STATUS_PATH, JSON.stringify({ state: 'idle', updatedAt: Date.now() }));
}

// ─── Interactive Platform Selection ──────────────────────────────────────

async function interactiveSelect(
  capabilities: RawCapability[],
  currentPlatform: string,
): Promise<RawCapability[]> {
  // Group by platform
  const platformCounts: Record<string, number> = {};
  for (const cap of capabilities) {
    for (const p of cap.compatibility) {
      platformCounts[p] = (platformCounts[p] ?? 0) + 1;
    }
  }

  // Default: current platform + universal selected
  const selected = new Set<string>([currentPlatform, 'universal']);
  const platforms = Object.keys(platformCounts).sort((a, b) => {
    if (a === currentPlatform) return -1;
    if (b === currentPlatform) return 1;
    if (a === 'universal') return -1;
    if (b === 'universal') return 1;
    return platformCounts[b] - platformCounts[a];
  });

  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const prompt = (q: string): Promise<string> =>
    new Promise(resolve => rl.question(q, resolve));

  console.log('\nWhich platforms to compile?');
  for (const p of platforms) {
    const check = selected.has(p) ? 'x' : ' ';
    console.log(`  [${check}] ${p} (${platformCounts[p]})`);
  }
  console.log('\nType platform names to toggle, or press Enter to confirm:');

  const answer = await prompt('> ');
  rl.close();

  if (answer.trim()) {
    for (const token of answer.trim().split(/[\s,]+/)) {
      if (selected.has(token)) {
        selected.delete(token);
      } else if (platformCounts[token] !== undefined) {
        selected.add(token);
      }
    }
  }

  return capabilities.filter(cap =>
    cap.compatibility.some(p => selected.has(p)),
  );
}

// ─── Compile ──────────────────────────────────────────────────────────────

async function cmdCompile() {
  // ─── Concurrency lock ─────────────────────────────────────────────────────
  const lockPath = join(LAZYBRAIN_DIR, 'compile.lock');
  if (existsSync(lockPath)) {
    const pidStr = (() => { try { return readFileSync(lockPath, 'utf-8').trim(); } catch { return ''; } })();
    const pid = parseInt(pidStr, 10);
    let running = false;
    if (!isNaN(pid) && pid > 0) {
      try { process.kill(pid, 0); running = true; } catch { running = false; }
    }
    if (running) {
      console.error(`Another compile is running (PID: ${pid}). Exiting.`);
      process.exit(1);
    }
    // Stale lock — remove it
    try { unlinkSync(lockPath); } catch {}
  }
  writeFileSync(lockPath, String(process.pid));
  process.on('exit', () => { try { unlinkSync(lockPath); } catch {} });

  const scanCachePath = join(LAZYBRAIN_DIR, 'scan-cache.json');
  if (!existsSync(scanCachePath)) {
    console.error('No scan cache found. Run `lazybrain scan` first.');
    process.exit(1);
  }

  const allRawCapabilities: RawCapability[] = JSON.parse(
    readFileSync(scanCachePath, 'utf-8'),
  );

  const isOffline = args.includes('--offline');
  const isAll = args.includes('--all');
  const isSelect = args.includes('--select');
  const config = loadConfig();
  const platform = config.platform ?? 'claude-code';

  // Assign tiers
  for (const cap of allRawCapabilities) {
    if (cap.compatibility.includes(platform)) {
      cap.tier = 0;
    } else if (cap.compatibility.includes('universal')) {
      cap.tier = 1;
    } else {
      cap.tier = 2;
    }
  }

  // Tier summary
  const tier0 = allRawCapabilities.filter(c => c.tier === 0);
  const tier1 = allRawCapabilities.filter(c => c.tier === 1);
  const tier2 = allRawCapabilities.filter(c => c.tier === 2);

  // Platform breakdown for tier 2
  const tier2Platforms: Record<string, number> = {};
  for (const cap of tier2) {
    const p = cap.compatibility[0] ?? 'unknown';
    tier2Platforms[p] = (tier2Platforms[p] ?? 0) + 1;
  }
  const tier2Summary = Object.entries(tier2Platforms)
    .map(([p, n]) => `${p}: ${n}`)
    .join(', ');

  console.log(`Scanned ${allRawCapabilities.length} capabilities:`);
  console.log(`  Tier 0 (${platform}): ${tier0.length}`);
  console.log(`  Tier 1 (universal):   ${tier1.length}`);
  console.log(`  Tier 2 (other):       ${tier2.length}${tier2Summary ? `  (${tier2Summary})` : ''}`);

  // Determine which capabilities to compile
  let rawCapabilities: RawCapability[];

  // --tier N: compile specific tier only
  const tierArgIdx = args.indexOf('--tier');
  if (tierArgIdx !== -1) {
    const tierVal = parseInt(args[tierArgIdx + 1], 10) as 0 | 1 | 2;
    rawCapabilities = allRawCapabilities.filter(c => c.tier === tierVal);
    console.log(`\nCompiling tier ${tierVal} only (${rawCapabilities.length} capabilities)...`);
  }
  // --platform <name>: compile specific platform
  else if (args.includes('--platform')) {
    const pIdx = args.indexOf('--platform');
    const targetPlatform = args[pIdx + 1];
    rawCapabilities = allRawCapabilities.filter(c =>
      c.compatibility.includes(targetPlatform as any),
    );
    console.log(`\nCompiling platform '${targetPlatform}' (${rawCapabilities.length} capabilities)...`);
  }
  // --select: interactive platform selection
  else if (isSelect) {
    rawCapabilities = await interactiveSelect(allRawCapabilities, platform);
    console.log(`\nCompiling ${rawCapabilities.length} selected capabilities...`);
  }
  // --all: compile everything
  else if (isAll) {
    rawCapabilities = allRawCapabilities;
    console.log(`\nCompiling all ${rawCapabilities.length} capabilities...`);
  }
  // Default: tier 0 + tier 1
  else {
    rawCapabilities = allRawCapabilities.filter(c => c.tier !== 2);
    console.log(`\nCompiling Tier 0 + Tier 1 (${rawCapabilities.length} capabilities)...`);
    if (tier2.length > 0) {
      console.log(`  Run 'lazybrain compile --all' to include other platforms.`);
    }
  }

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
    writeFileSync(STATUS_PATH, JSON.stringify({ state: 'idle', updatedAt: Date.now() }));
  } else {
    // LLM mode
    console.log(`  Mode: LLM (${config.compileModel})`);
    const llm = createLLMProvider({
      model: config.compileModel,
      apiBase: config.compileApiBase,
      apiKey: config.compileApiKey,
    });

    // Load existing graph for incremental compilation (skip with --force)
    const liveGraph = (existsSync(GRAPH_PATH) && !args.includes('--force'))
      ? Graph.load(GRAPH_PATH)
      : new Graph();

    const sigintHandler = () => {
      liveGraph.save(GRAPH_PATH);
      console.log(`\n\nInterrupted. Saved ${liveGraph.getAllNodes().length} nodes to ${GRAPH_PATH}`);
      console.log('Run `lazybrain compile` (without --force) to resume.');
      process.exit(0);
    };
    process.on('SIGINT', sigintHandler);

    const phase1Bar = createProgressBar({ label: 'Phase 1/2  Tags & Categories' });
    phase1Bar.start(rawCapabilities.length);
    writeFileSync(STATUS_PATH, JSON.stringify({ state: 'compiling', progress: `0/${rawCapabilities.length}`, updatedAt: Date.now() }));

    const phase2Bar = createProgressBar({ label: 'Phase 2/2  Relation Inference' });

    const result = await compile(rawCapabilities, {
      llm,
      modelName: config.compileModel,
      existingGraph: liveGraph,
      forceRelations: args.includes('--force'),
      skipRelations: !args.includes('--with-relations'),
      checkpointPath: GRAPH_PATH,
      onProgress: (current, total, name) => {
        phase1Bar.update(current, name);
        writeFileSync(STATUS_PATH, JSON.stringify({ state: 'compiling', progress: `${current}/${total}`, updatedAt: Date.now() }));
      },
      onRelationProgress: (current, total) => {
        if (current === total) {
          phase2Bar.complete();
        } else {
          if (current === 0) {
            phase2Bar.start(total);
          }
          phase2Bar.update(current);
        }
      },
    });

    process.removeListener('SIGINT', sigintHandler);
    result.graph.save(GRAPH_PATH);
    console.log(`\nCompile complete:`);
    const elapsed = (phase1Bar.getElapsedSeconds() + (phase2Bar.getElapsedSeconds?.() ?? 0)).toFixed(0);
    const errors = result.errors.length;
    console.log(`  ${errors === 0 ? '✓' : '⚠'} Compiled ${result.compiled} capabilities  (${errors} errors, ${result.skipped} skipped)`);
    console.log(`  Tokens: ${(result.totalTokens.input / 1000).toFixed(1)}K input / ${(result.totalTokens.output / 1000).toFixed(1)}K output`);
    console.log(`  Time: ${elapsed}s`);
    const s = result.graph.stats();
    console.log(`  Nodes: ${s.nodes}, Links: ${s.links}`);
    console.log(`\n  Saved to ${GRAPH_PATH}`);
    writeFileSync(STATUS_PATH, JSON.stringify({ state: 'idle', updatedAt: Date.now() }));
  }
}

/**
 * Offline compilation: no LLM, uses rule-based category classifier
 * and raw triggers/name/description as tags.
 */
function compileOffline(rawCapabilities: RawCapability[]): Graph {
  // 保留已有 links（offline compile 跳过 LLM，无法重新生成 links）
  const existingGraph = existsSync(GRAPH_PATH) ? Graph.load(GRAPH_PATH) : null;
  const existingLinks = existingGraph ? existingGraph.getAllLinks() : [];

  const graph = new Graph();
  const newNodeIds = new Set<string>();

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
    newNodeIds.add(id);
  }

  // 恢复 links（只保留引用仍存在 node 的 links）
  for (const link of existingLinks) {
    if (newNodeIds.has(link.source) && newNodeIds.has(link.target)) {
      graph.addLink(link);
    }
  }

  // 如果没有已有 links，基于规则生成（tag 相似度）
  if (graph.getAllLinks().length === 0) {
    generateOfflineLinks(graph);
  }

  graph.setCompileInfo('offline');
  return graph;
}

/**
 * 基于规则生成 links（不需要 LLM）
 * - similar_to: tag 重叠度 > 40%
 * - composes_with: category 相同
 */
function generateOfflineLinks(graph: Graph): void {
  const nodes = graph.getAllNodes();
  const addedLinks = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];

      // similar_to: tag 重叠度 > 40%
      const aTags = new Set(a.tags.map(t => t.toLowerCase()));
      const bTags = new Set(b.tags.map(t => t.toLowerCase()));
      let overlap = 0;
      for (const tag of aTags) {
        if (bTags.has(tag)) overlap++;
      }
      const unionSize = aTags.size + bTags.size - overlap;
      const jaccard = unionSize > 0 ? overlap / unionSize : 0;

      if (jaccard > 0.4) {
        const linkKey = `${a.id}→${b.id}`;
        if (!addedLinks.has(linkKey)) {
          graph.addLink({
            source: a.id,
            target: b.id,
            type: 'similar_to',
            description: `共享 tags: ${[...aTags].filter(t => bTags.has(t)).join(', ')}`,
            diff: `${a.name} vs ${b.name}`,
            confidence: jaccard,
          });
          addedLinks.add(linkKey);
        }
      }

      // composes_with: category 相同且不是 similar_to
      if (a.category === b.category && jaccard <= 0.4) {
        const linkKey = `${a.id}→${b.id}`;
        if (!addedLinks.has(linkKey)) {
          graph.addLink({
            source: a.id,
            target: b.id,
            type: 'composes_with',
            description: `同属 ${a.category} 分类`,
            confidence: 0.6,
          });
          addedLinks.add(linkKey);
        }
      }
    }
  }
}

function generateOfflineTags(raw: RawCapability): string[] {
  const tags: Set<string> = new Set();

  // 1. name 拆分（kebab-case → 独立词）
  for (const part of raw.name.split(/[-_]/)) {
    if (part.length > 2) tags.add(part.toLowerCase());
  }

  // 2. description 提取有价值的 token
  const desc = raw.description ?? '';
  // 提取引号内容
  for (const m of desc.matchAll(/"([^"]+)"/g)) tags.add(m[1].toLowerCase());
  // 提取 PascalCase/camelCase 词
  for (const m of desc.matchAll(/[A-Z][a-z]+(?:[A-Z][a-z]+)+/g)) tags.add(m[0].toLowerCase());
  // 提取技术术语（带连字符的复合词）
  for (const m of desc.matchAll(/\b[a-z]+-[a-z]+(?:-[a-z]+)*\b/g)) tags.add(m[0]);

  // 3. frontmatter triggers 直接作为 tag
  if (raw.triggers) {
    for (const t of raw.triggers) tags.add(t.toLowerCase());
  }

  // 4. 中文 tags（通过映射表）
  const allTags = [...tags];
  for (const tag of allTags) {
    const zhVariants = ZH_TAG_MAP[tag];
    if (zhVariants) for (const zh of zhVariants) tags.add(zh);
  }

  // 5. 过滤停用词
  const STOP = new Set(['a','an','the','and','or','but','in','on','at','to','for','of','with','by','from','is','it','be','this','that','safely','step']);
  return [...tags].filter(t => !STOP.has(t) && t.length > 1).slice(0, 15);
}

// 中英 tag 映射表
const ZH_TAG_MAP: Record<string, string[]> = {
  'review': ['审查', '审核', '评审', '检查'],
  'refactor': ['重构', '重写'],
  'test': ['测试', '单测', '集成测试'],
  'debug': ['调试', '排错', '修复'],
  'deploy': ['部署', '发布', '上线'],
  'security': ['安全', '认证', '鉴权'],
  'performance': ['性能', '优化', '加速'],
  'code': ['代码', '编码', '编程'],
  'plan': ['计划', '规划', '方案', '设计'],
  'build': ['构建', '编译', '打包'],
  'commit': ['提交', '推送'],
  'search': ['搜索', '查找', '检索'],
  'document': ['文档', '文件', '说明'],
  'database': ['数据库', '数据', '存储'],
  'api': ['接口', '端点'],
  'frontend': ['前端', '界面', 'UI'],
  'backend': ['后端', '服务端'],
  'architecture': ['架构', '系统设计'],
  'clean': ['清理', '清洗', '整理'],
  'install': ['安装', '配置', '初始化'],
  'monitor': ['监控', '日志', '追踪'],
  'cache': ['缓存', '加速'],
  'config': ['配置', '设置', '环境'],
  'validate': ['验证', '校验', '检查'],
  'parse': ['解析', '提取', '转换'],
  'generate': ['生成', '创建', '产出'],
  'analyze': ['分析', '评估', '诊断'],
  'optimize': ['优化', '改进', '提升'],
  'rollback': ['回滚', '撤销', '恢复'],
  'schedule': ['调度', '定时', '计划'],
  'notify': ['通知', '提醒', '告警'],
  'encrypt': ['加密', '解密', '签名'],
  'proxy': ['代理', '转发', '中间件'],
  'docker': ['容器', '镜像', 'Docker'],
  'git': ['版本控制', 'Git'],
  'cicd': ['CI/CD', '持续集成', '流水线'],
  'template': ['模板', '脚手架', '样板'],
  'query': ['查询', '搜索', '检索'],
  'transform': ['转换', '变换', '处理'],
  'export': ['导出', '输出'],
  'import': ['导入', '引入'],
  'sync': ['同步', '复制', '镜像'],
  'backup': ['备份', '归档'],
  'restore': ['恢复', '还原'],
  'batch': ['批量', '批处理'],
  'stream': ['流式', '实时'],
  'parallel': ['并行', '并发'],
};

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

  const history = loadRecentHistory(50);
  const result = await match(query, { graph, config, history });

  if (result.matches.length === 0) {
    console.log(`No matches for "${query}".`);
    return;
  }

  console.log(`\n${result.matches.length} match(es) for "${query}"\n`);

  for (const [i, m] of result.matches.entries()) {
    const pct = Math.round(m.score * 100);
    const origin = m.capability.origin ? ` [${m.capability.origin}]` : '';
    const boostStr = m.historyBoost && m.historyBoost > 0.01
      ? ` ↑ 历史加权 +${Math.round(m.historyBoost * 100)}%`
      : '';
    console.log(`  [${i + 1}] ${m.capability.name} (${pct}%)${origin}${boostStr}`);
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
  const config = loadConfig();

  // ─── Graph stats ───────────────────────────────────────────────────────
  if (existsSync(GRAPH_PATH)) {
    const graph = Graph.load(GRAPH_PATH);
    const s = graph.stats();
    console.log('\n📊 LazyBrain 图谱统计:');
    console.log(`   节点: ${s.nodes} | 链接: ${s.links} | 分类: ${s.categories}`);
    console.log('   类型分布:');
    for (const [k, v] of Object.entries(s.byKind)) {
      console.log(`     ${k}: ${v}`);
    }
    console.log('   状态分布:');
    for (const [k, v] of Object.entries(s.byStatus)) {
      if (v > 0) console.log(`     ${k}: ${v}`);
    }
  } else {
    console.log('\n📊 LazyBrain 图谱: (未初始化，运行 `lazybrain scan` 先)');
  }

  // ─── History stats ─────────────────────────────────────────────────────
  if (existsSync(HISTORY_PATH)) {
    const lines = readFileSync(HISTORY_PATH, 'utf-8').trim().split('\n').filter(Boolean);
    const total = lines.length;

    const reasonCount: Record<string, number> = {};
    const acceptedCount = { matched: 0, secretary: 0, total: 0 };
    const layerCount: Record<string, number> = {};
    const recentDates = new Set<string>();
    const todayStr = new Date().toISOString().slice(0, 10);

    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        // reason breakdown
        reasonCount[e.reason ?? 'matched'] = (reasonCount[e.reason ?? 'matched'] ?? 0) + 1;
        // acceptance
        if (e.accepted) {
          acceptedCount.total++;
          if (e.layer === 'llm') acceptedCount.secretary++;
          else acceptedCount.matched++;
        }
        // layer
        layerCount[e.layer ?? 'tag'] = (layerCount[e.layer ?? 'tag'] ?? 0) + 1;
        // date tracking
        const date = e.timestamp?.slice(0, 10);
        if (date) recentDates.add(date);
      } catch {}
    }

    const acceptRate = total > 0 ? Math.round((acceptedCount.total / total) * 100) : 0;
    const secretaryRate = acceptedCount.total > 0
      ? Math.round((acceptedCount.secretary / acceptedCount.total) * 100) : 0;

    console.log('\n📋 LazyBrain 历史 (history.jsonl):');
    console.log(`   总查询: ${total} | 接受率: ${acceptRate}% | 覆盖天数: ${recentDates.size}`);
    console.log('   激活结果:');
    const reasonLabels: Record<string, string> = {
      matched: '✅ 匹配注入', no_match: '❌ 无匹配', low_score: '⚠️ 分数太低',
      secretary_no_tool: '🔇 Secretary无需工具', secretary_rejected: '🔇 Secretary拒绝',
      no_graph: '🚫 无图', error: '💥 异常',
    };
    for (const [r, cnt] of Object.entries(reasonCount).sort((a, b) => b[1] - a[1])) {
      const label = reasonLabels[r] ?? r;
      console.log(`     ${label}: ${cnt}`);
    }
    if (acceptedCount.total > 0) {
      console.log(`   匹配来源: tag/alias层 ${acceptedCount.matched} | secretary层 ${acceptedCount.secretary}`);
    }
  } else {
    console.log('\n📋 LazyBrain 历史: (无 history.jsonl，重启 Claude Code 后开始记录)');
  }

  // ─── Usage stats ───────────────────────────────────────────────────────
  const USAGE_PATH = join(LAZYBRAIN_DIR, 'usage.jsonl');
  if (existsSync(USAGE_PATH)) {
    const lines = readFileSync(USAGE_PATH, 'utf-8').trim().split('\n').filter(Boolean);
    let totalInput = 0, totalOutput = 0, totalCost = 0;
    const taskTypes: Record<string, number> = {};
    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        totalInput += e.inputTokens ?? 0;
        totalOutput += e.outputTokens ?? 0;
        totalCost += e.costUsd ?? 0;
        if (e.taskType) taskTypes[e.taskType] = (taskTypes[e.taskType] ?? 0) + 1;
      } catch {}
    }
    const totalTokens = totalInput + totalOutput;
    console.log('\n💰 LazyBrain 使用审计 (usage.jsonl):');
    console.log(`   Session: ${lines.length} | 总Token: ${(totalTokens / 1000).toFixed(1)}k | 总成本: $${totalCost.toFixed(4)}`);
    const topTasks = Object.entries(taskTypes).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topTasks.length > 0) {
      console.log('   任务类型 Top5:');
      for (const [t, cnt] of topTasks) {
        console.log(`     ${t}: ${cnt}`);
      }
    }
  } else {
    console.log('\n💰 LazyBrain 使用审计: (无 usage.jsonl，可手动运行 summary/report 查看本地审计摘要)');
  }

  // ─── Config summary ────────────────────────────────────────────────────
  console.log('\n⚙️  当前配置:');
  console.log(`   策略: ${config.strategy} | 模式: ${config.mode} | 引擎: ${config.engine}`);
  console.log(`   自动阈值: ${config.autoThreshold} | 平台: ${config.platform}`);
  if (config.compileApiBase) {
    console.log(`   Compile API: ✅ 已配置 (${config.compileModel})`);
  } else {
    console.log('   Compile API: ❌ 未配置 (--offline 模式运行)');
  }
  if (config.secretaryApiBase) {
    console.log(`   Secretary API: ✅ 已配置 (${config.secretaryModel})`);
  } else {
    console.log('   Secretary API: ❌ 未配置 (不启用 Secretary 层)');
  }

  // ─── Duplicate detection ─────────────────────────────────────────────────
  if (existsSync(GRAPH_PATH)) {
    const graph = Graph.load(GRAPH_PATH);
    const pairs = detectDuplicates(graph);
    if (pairs.length === 0) {
      console.log('\n重复工具检测：');
      console.log('   ✓ 未检测到重复工具');
    } else {
      console.log('\n重复工具检测：');
      console.log(`   发现 ${pairs.length} 对疑似重复：`);
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        console.log(`     ${i + 1}. [${pair.a.kind}] ${pair.a.name} (${pair.a.origin}) ⚠ ${pair.b.name} (${pair.b.origin}) — ${pair.reason}`);
      }
    }
  }
}

function cmdGraph() {
  if (!existsSync(GRAPH_PATH)) {
    console.error('Graph is empty. Run `lazybrain scan && lazybrain compile` first.');
    process.exit(1);
  }

  const graph = Graph.load(GRAPH_PATH);
  const format = args.includes('--mermaid') ? 'mermaid' : 'json';
  const limitIndex = args.indexOf('--limit');
  const kindIndex = args.indexOf('--kind');
  const originIndex = args.indexOf('--origin');
  const categoryIndex = args.indexOf('--category');
  const parsedLimit = limitIndex >= 0 ? parseInt(args[limitIndex + 1] ?? '80', 10) : 80;
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, parsedLimit) : 80;
  const kind = kindIndex >= 0 ? args[kindIndex + 1] : undefined;
  const origin = originIndex >= 0 ? args[originIndex + 1] : undefined;
  const category = categoryIndex >= 0 ? args[categoryIndex + 1] : undefined;
  const view = buildGraphView(graph, { limit, kind, origin, category });

  if (format === 'mermaid') {
    console.log(formatGraphMermaid(view));
    return;
  }

  console.log(JSON.stringify(view, null, 2));
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

// ─── Suggest Aliases ────────────────────────────────────────────────────

function cmdSuggestAliases() {
  const history = loadRecentHistory(100);
  if (history.length === 0) {
    console.log('No history found. Run lazybrain hook first to build history.');
    return;
  }

  const toolStats = new Map<string, number>();
  for (const entry of history) {
    if (entry.accepted) {
      toolStats.set(entry.matched, (toolStats.get(entry.matched) ?? 0) + 1);
    }
  }

  const suggestions = [...toolStats.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (suggestions.length === 0) {
    console.log('No alias suggestions (need 3+ uses for a tool to suggest alias).');
    return;
  }

  // Detect alias collisions before suggesting
  const seenAlias = new Set<string>();
  const collisions: Array<[string, string]> = [];

  console.log('\n📝 Suggested aliases (based on your usage history):\n');
  for (const [tool, count] of suggestions) {
    let alias = tool.replace(/[-_]/g, '').toLowerCase();
    if (seenAlias.has(alias)) {
      // Disambiguate by appending the first distinctive char
      alias = alias + count;  // e.g. codereview → codereview3
      collisions.push([tool, alias]);
    }
    seenAlias.add(alias);
    console.log(`  "${alias}" -> "${tool}"  (${count} uses)`);
  }
  if (collisions.length > 0) {
    console.log('\n⚠️  Alias collisions were disambiguated:');
    for (const [, alias] of collisions) {
      console.log(`  (disambiguated: "${alias}")`);
    }
  }
  console.log('\nTo add an alias, run:');
  console.log('  lazybrain alias set <alias> <target>');
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

function cmdDistill() {
  const history = loadRecentHistory(10000);
  if (history.length === 0) {
    console.log('No history found. Use LazyBrain for a while first.');
    return;
  }
  const profile = distillAndSave(history);
  console.log(`Profile distilled from ${profile.eventCount} events`);
  console.log(`  Tools: ${profile.toolAffinities.length} unique`);
  console.log(`  Chains: ${profile.taskChains.length} patterns`);
  console.log(`  Advanced ratio: ${Math.round(profile.advancedToolRatio * 100)}%`);
  if (profile.taskChains.length > 0) {
    console.log(`  Top chain: ${profile.taskChains[0].sequence.join(' → ')} (${profile.taskChains[0].count}x)`);
  }
  if (profile.sessionCount > 0) {
    console.log(`\n  [Phase 3.2 — Usage Profile]`);
    console.log(`  Sessions: ${profile.sessionCount}`);
    console.log(`  Total cost: $${profile.totalCost}`);
    console.log(`  Avg session: ${profile.avgInputTokens.toLocaleString()} in / ${profile.avgOutputTokens.toLocaleString()} out tokens, $${profile.avgSessionCost}`);
    if (profile.topTaskTypes.length > 0) {
      console.log(`  Top task types: ${profile.topTaskTypes.map(t => `${t.type}(${t.count})`).join(', ')}`);
    }
    if (profile.agentTypesUsed.length > 0) {
      console.log(`  Agents used: ${profile.agentTypesUsed.join(', ')}`);
      console.log(`  Avg agents/session: ${profile.avgAgentsPerSession}`);
    }
    if (profile.shouldUseAgentComposition) {
      console.log(`  Suggestion: agent composition recommended (${profile.avgAgentsPerSession}+ agents/session)`);
    }
  }
}

function cmdEvolve() {
  const dryRun = args.includes('--dry-run');
  const rollback = args.includes('--rollback');
  const yes = args.includes('--yes') || args.includes('-y');

  if (rollback) {
    evolveCapabilities({ rollback: true });
    return;
  }

  const history = loadRecentHistory(99999);
  const historyCount = history.length;

  if (historyCount < 200) {
    console.log(`⚠️  当前 history: ${historyCount} 条（建议 200+ 条后再运行 evolve，当前结果可靠性低）`);
    if (!yes) {
      console.log('   继续运行可能产生噪声标签。使用 --yes 跳过此警告。');
    }
  } else {
    console.log(`✅ 当前 history: ${historyCount} 条，数据量充足`);
  }

  if (!yes && historyCount < 200) {
    console.log('（使用 --yes 强制继续）');
    return;
  }

  if (dryRun) {
    evolveCapabilities({ dryRun: true });
  } else {
    evolveCapabilities();
  }
}

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

// ─── Team ─────────────────────────────────────────────────────────────────

function cmdTeam() {
  const query = args.slice(1).join(' ');
  if (!query) {
    console.error('Usage: lazybrain team "<query>"');
    process.exit(1);
  }

  if (!existsSync(GRAPH_PATH)) {
    console.error('No graph found. Run `lazybrain scan && lazybrain compile` first.');
    process.exit(1);
  }

  const graph = Graph.load(GRAPH_PATH);
  const composition = recommendTeam(query, graph, 5);

  if (!composition || composition.members.length === 0) {
    console.log(`No team composition found for "${query}".`);
    return;
  }

  const agentCount = graph.getAllNodes().filter(n => n.kind === 'agent').length;
  console.log(`\n## 🎯 Team 组合建议\n`);
  console.log(`检测到你想用 /team，基于任务**${query}**，从 ${agentCount} 个 agent 里筛选出：\n`);
  console.log('| # | Agent | 领域 | 理由 |');
  console.log('|---|-------|------|------|');
  for (let i = 0; i < composition.members.length; i++) {
    const m = composition.members[i];
    console.log(`| ${i + 1} | **${m.agent.name}** | ${m.category} | ${m.reason} |`);
  }
  console.log('\n> **组合理由**：' + composition.overallReason);
  console.log('\n> 建议命令：`' + composition.suggestedCommand + '`');
  console.log('\n> OMC 可执行命令：`' + composition.omcBridge.command + '`');
  console.log('\n> Lead brief:\n```text\n' + composition.omcBridge.leadBrief + '\n```');
  console.log('\n> 如果想默认 executor：`/team 3:executor "<task>"`');
}

// ─── Dups ─────────────────────────────────────────────────────────────────

function cmdDups() {
  if (!existsSync(GRAPH_PATH)) {
    console.error('No graph found. Run `lazybrain scan && lazybrain compile` first.');
    process.exit(1);
  }
  const graph = Graph.load(GRAPH_PATH);
  const pairs = detectDuplicates(graph);

  if (pairs.length === 0) {
    console.log('✓ 未检测到重复工具');
    return;
  }

  console.log(`发现 ${pairs.length} 对疑似重复：\n`);
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    console.log(`  ${i + 1}. [${pair.a.kind}] ${pair.a.name} (${pair.a.origin}) ⚠ ${pair.b.name} (${pair.b.origin})`);
    console.log(`     原因: ${pair.reason}`);
    console.log(`     相似度: ${Math.round(pair.similarity * 100)}%`);
    console.log();
  }
}

// ─── Compare ───────────────────────────────────────────────────────────────

function cmdCompare() {
  const aQuery = args[1];
  const bQuery = args[2];

  if (!aQuery || !bQuery) {
    console.error('Usage: lazybrain compare <capability-a> <capability-b>');
    console.error('  capability format: <name> or <origin>:<name>');
    process.exit(1);
  }

  if (!existsSync(GRAPH_PATH)) {
    console.error('No graph found. Run `lazybrain scan && lazybrain compile` first.');
    process.exit(1);
  }

  const graph = Graph.load(GRAPH_PATH);
  const a = findCapabilityByNameOrId(graph, aQuery);
  const b = findCapabilityByNameOrId(graph, bQuery);

  if (!a) {
    console.error(`Capability not found: "${aQuery}"`);
    process.exit(1);
  }
  if (!b) {
    console.error(`Capability not found: "${bQuery}"`);
    process.exit(1);
  }

  console.log(compareCapabilities(a, b));
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
  const statuslineScript = resolve(binDir, 'statusline.js');
  const combinedStatuslineScript = resolve(binDir, 'statusline-combined.js');
  const shouldInstallStatusline = args.includes('--statusline') || args.includes('--install-statusline');
  const shouldReplaceStatusline = args.includes('--replace-statusline');
  const isLazyBrainCommand = (command: unknown): command is string => (
    typeof command === 'string' &&
    (command.includes('lazybrain') ||
      command.includes('/lazy_user/') ||
      isLazyBrainHookCommand(command) ||
      command.includes('dist/bin/statusline.js') ||
      command.includes('dist/bin/statusline-combined.js') ||
      command.includes(statuslineScript) ||
      command.includes(combinedStatuslineScript))
  );

  switch (sub) {
    case 'install': {
      if (!existsSync(hookScript)) {
        console.error(`Hook script not found: ${hookScript}`);
        console.error('Run `npm run build` first.');
        process.exit(1);
      }
      if (!existsSync(statuslineScript)) {
        console.error(`Statusline script not found: ${statuslineScript}`);
        console.error('Run `npm run build` first.');
        process.exit(1);
      }
      if (!existsSync(combinedStatuslineScript)) {
        console.error(`Combined statusline script not found: ${combinedStatuslineScript}`);
        console.error('Run `npm run build` first.');
        process.exit(1);
      }

      const installScope: HookInstallScope = args.includes('--global') ? 'global' : 'project';
      const workspaceRoot = installScope === 'project' ? resolve(process.cwd()) : undefined;

      let settings: Record<string, unknown> = {};
      if (existsSync(settingsPath)) {
        try {
          settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
        } catch {
          console.error(`Failed to parse ${settingsPath}`);
          process.exit(1);
        }
      }

      settings = upsertLazyBrainUserPromptSubmit(settings, `node ${hookScript}`);

      const existingStatusline = settings.statusLine as { command?: unknown } | string | undefined;
      const existingStatuslineCommand = typeof existingStatusline === 'string'
        ? existingStatusline
        : typeof existingStatusline?.command === 'string'
          ? existingStatusline.command
          : '';
      let chainedUpstreamCommand = '';
      const statuslineChainPath = getStatuslineChainPath();
      try {
        const chain = existsSync(statuslineChainPath)
          ? JSON.parse(readFileSync(statuslineChainPath, 'utf-8')) as { upstreamCommand?: unknown }
          : {};
        if (typeof chain.upstreamCommand === 'string') {
          chainedUpstreamCommand = chain.upstreamCommand;
        }
      } catch {}

      const hasOtherStatusline = Boolean(existingStatuslineCommand && !isLazyBrainCommand(existingStatuslineCommand));
      const alreadyCombined = Boolean(existingStatuslineCommand && existingStatuslineCommand.includes(combinedStatuslineScript));
      const shouldComposeStatusline = shouldInstallStatusline && hasOtherStatusline && !shouldReplaceStatusline;
      const shouldUseLazyBrainOnlyStatusline = (
        shouldReplaceStatusline ||
        (isLazyBrainCommand(existingStatuslineCommand) && !alreadyCombined) ||
        (!existingStatuslineCommand && shouldInstallStatusline)
      );

      let statuslineMode: HookStatuslineMode = 'none';

      if (shouldComposeStatusline) {
        writeFileSync(statuslineChainPath, JSON.stringify({
          upstreamCommand: existingStatuslineCommand,
          upstreamType: typeof existingStatusline === 'string' ? 'legacy-string' : 'command-object',
          installedAt: new Date().toISOString(),
        }, null, 2));
        settings.statusLine = {
          type: 'command',
          command: `node ${combinedStatuslineScript}`,
        };
        statuslineMode = 'combined';
      } else if (alreadyCombined && chainedUpstreamCommand) {
        settings.statusLine = {
          type: 'command',
          command: `node ${combinedStatuslineScript}`,
        };
        statuslineMode = 'combined';
      } else if (shouldUseLazyBrainOnlyStatusline) {
        settings.statusLine = {
          type: 'command',
          command: `node ${statuslineScript}`,
        };
        statuslineMode = 'lazybrain';
      } else if (hasOtherStatusline) {
        statuslineMode = 'skipped';
      }

      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      writeHookInstallState({
        scope: installScope,
        workspaceRoot,
        hookCommand: `node ${hookScript}`,
        installedAt: new Date().toISOString(),
        statuslineMode,
      });
      console.log(`Hook installed: ${settingsPath}`);
      console.log(`  Script: ${hookScript}`);
      console.log('  Lifecycle: UserPromptSubmit only (Stop 已退出)');
      console.log(`  Scope: ${installScope}${workspaceRoot ? ` (${workspaceRoot})` : ''}`);
      if (installScope === 'global') {
        console.log('  Warning: global scope 会让 LazyBrain 在所有 Claude 会话里被调起，仅建议明确需要时使用。');
      }
      if (shouldComposeStatusline) {
        console.log(`  Statusline: ${combinedStatuslineScript}`);
        console.log('  Statusline mode: combined with existing HUD');
      } else if (alreadyCombined && chainedUpstreamCommand) {
        console.log(`  Statusline: ${combinedStatuslineScript}`);
        console.log('  Statusline mode: already combined');
      } else if (shouldUseLazyBrainOnlyStatusline) {
        console.log(`  Statusline: ${statuslineScript}`);
      } else if (hasOtherStatusline) {
        console.log('  Statusline: skipped because another statusLine is already configured.');
        console.log('  Re-run `lazybrain hook install --statusline` to combine with it, or `--replace-statusline` to replace it.');
      } else {
        console.log('  Statusline: not installed. Use `lazybrain hook install --statusline` if you want LazyBrain statusline and no existing HUD is configured.');
      }
      console.log('  Runtime guard: 非目标项目 cwd 将直接跳过');
      console.log(`  Restart Claude Code to activate.`);
      break;
    }
    case 'restore-statusline': {
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

      const statuslineChainPath = getStatuslineChainPath();
      if (!existsSync(statuslineChainPath)) {
        console.error('No LazyBrain statusline chain backup found.');
        process.exit(1);
      }

      let upstreamCommand = '';
      let upstreamType = 'command-object';
      try {
        const chain = JSON.parse(readFileSync(statuslineChainPath, 'utf-8')) as {
          upstreamCommand?: unknown;
          upstreamType?: unknown;
        };
        if (typeof chain.upstreamCommand === 'string') upstreamCommand = chain.upstreamCommand;
        if (typeof chain.upstreamType === 'string') upstreamType = chain.upstreamType;
      } catch {
        console.error(`Failed to parse ${statuslineChainPath}`);
        process.exit(1);
      }

      if (!upstreamCommand) {
        console.error('No upstream statusLine command found in chain backup.');
        process.exit(1);
      }

      settings.statusLine = upstreamType === 'legacy-string'
        ? upstreamCommand
        : { type: 'command', command: upstreamCommand };

      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log('Statusline restored from LazyBrain chain backup.');
      console.log(`  Command: ${upstreamCommand}`);
      console.log('  Restart Claude Code to activate.');
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

      settings = removeLazyBrainHookRegistrations(settings);
      clearHookInstallState();
      cleanHookRuntimeRecords();

      const existingStatusline = settings.statusLine as { command?: unknown } | string | undefined;
      const existingStatuslineCommand = typeof existingStatusline === 'string'
        ? existingStatusline
        : typeof existingStatusline?.command === 'string'
          ? existingStatusline.command
          : '';
      if (isLazyBrainCommand(existingStatuslineCommand)) {
        delete settings.statusLine;
      }

      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log('Hook uninstalled.');
      break;
    }
    case 'status': {
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

      const config = loadConfig();
      const runtime = getHookRuntimeSnapshot({ config });
      const status = getHookLifecycleStatus(settings, { runtime });
      const stopAudit = loadLatestStopHookAudit(process.cwd());
      const installState = status.installState;

      console.log('LazyBrain hook 状态：');
      console.log(`  UserPromptSubmit: ${status.lazybrainUserPromptSubmit ? '✅ 已安装' : '❌ 未安装'}`);
      console.log(`  Stop: ${status.lazybrainStop ? '⚠️ 仍存在 LazyBrain 残留' : '✅ 无 LazyBrain 注册'}`);
      console.log(`  SessionStart: ${status.lazybrainSessionStart ? 'ℹ️ 含 LazyBrain' : 'ℹ️ 无 LazyBrain 注册'}`);
      console.log(`  Scope: ${installState ? installState.scope : 'unknown'}`);
      if (installState?.workspaceRoot) {
        console.log(`  Workspace root: ${installState.workspaceRoot}`);
      }
      console.log(`  Active hooks: ${status.runtime.activeRuns.length}`);
      console.log(`  Hung hooks: ${status.runtime.hungRuns.length}`);
      console.log(`  Breaker: ${status.breakerOpen ? 'OPEN' : 'closed'}`);
      console.log(`  Avg / P95: ${status.avgDurationMs}ms / ${status.p95DurationMs}ms`);
      console.log('');
      console.log('当前 Stop 链：');
      if (status.stopCommands.length === 0) {
        console.log('  (空)');
      } else {
        for (const command of status.stopCommands) {
          const kind = command.includes('claude-mem') ? 'claude-mem'
            : command.includes('codeisland-state.py') ? 'codeisland'
            : isLazyBrainHookCommand(command) ? 'lazybrain'
            : 'other';
          console.log(`  - [${kind}] ${command}`);
        }
      }

      console.log('');
      console.log('当前 UserPromptSubmit 链：');
      if (status.userPromptSubmitCommands.length === 0) {
        console.log('  (空)');
      } else {
        for (const command of status.userPromptSubmitCommands) {
          const kind = isLazyBrainHookCommand(command) ? 'lazybrain'
            : command.includes('keyword-detector') ? 'keyword-detector'
            : command.includes('codeisland-state.py') ? 'codeisland'
            : command.includes('claude-mem') ? 'claude-mem'
            : 'other';
          console.log(`  - [${kind}] ${command}`);
        }
      }

      if (stopAudit) {
        console.log('');
        console.log(`最近一次 Stop 审计：${stopAudit.timestamp} (${stopAudit.sessionFile})`);
        for (const entry of stopAudit.entries) {
          const kind = entry.command.includes('claude-mem') ? 'claude-mem'
            : entry.command.includes('codeisland-state.py') ? 'codeisland'
            : isLazyBrainHookCommand(entry.command) ? 'lazybrain'
            : entry.command.includes('cmux') ? 'cmux'
            : 'other';
          console.log(`  - [${kind}] ${entry.durationMs}ms`);
        }
      } else {
        console.log('');
        console.log('最近一次 Stop 审计：未找到 stop_hook_summary 日志');
      }
      break;
    }
    case 'ps': {
      const config = loadConfig();
      const snapshot = getHookRuntimeSnapshot({ config });
      if (snapshot.activeRuns.length === 0) {
        console.log('No active LazyBrain hooks.');
        return;
      }
      console.log('Active LazyBrain hooks:');
      for (const run of snapshot.activeRuns) {
        const isHung = snapshot.hungRuns.some((hung) => hung.runId === run.runId);
        console.log(`  - pid=${run.pid} event=${run.hookEventName} ageMs=${Date.now() - run.startedAt} hung=${isHung ? 'yes' : 'no'} cwd=${run.cwd ?? '(unknown)'}`);
      }
      break;
    }
    case 'clean': {
      const config = loadConfig();
      const snapshot = cleanHookRuntimeRecords({ config });
      console.log(`Removed ${snapshot.staleRuns.length} stale hook records.`);
      console.log(`Active hooks remaining: ${snapshot.activeRuns.length}`);
      console.log(`Hung hooks retained: ${snapshot.hungRuns.length}`);
      break;
    }
    default:
      console.error('Usage: lazybrain hook [install|uninstall|restore-statusline|status|ps|clean] [--statusline|--replace-statusline|--global]');
      process.exit(1);
  }
}

function getBudgetCheckerState(): string {
  try {
    const uid = typeof process.getuid === 'function' ? String(process.getuid()) : '';
    const output = execFileSync('launchctl', ['print-disabled', `gui/${uid}`], { encoding: 'utf-8' });
    const match = output.match(/"com\.lazybrain\.budget-check"\s*=>\s*(true|false|disabled|enabled)/);
    if (!match) return 'unknown';
    if (match[1] === 'true' || match[1] === 'disabled') return 'disabled';
    if (match[1] === 'false' || match[1] === 'enabled') return 'enabled';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function cmdDoctor() {
  const shouldFix = args.includes('--fix');
  const config = loadConfig();
  const settingsPath = join(
    process.env.CLAUDE_CONFIG_DIR ?? join(process.env.HOME ?? '~', '.claude'),
    'settings.json',
  );
  const budgetCheckerState = getBudgetCheckerState();

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    } catch {}
  }
  const binDir = dirname(fileURLToPath(import.meta.url));
  const hookScript = resolve(binDir, 'hook.js');
  const hookCommand = `node ${hookScript}`;
  const repairs: string[] = [];

  if (shouldFix) {
    const existingState = readHookInstallState();
    if (existingState) {
      settings = removeLazyBrainHookRegistrations(settings);
      settings = upsertLazyBrainUserPromptSubmit(settings, hookCommand);
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      const repairedScope: HookInstallScope = existingState.scope;
      const repairedRoot = repairedScope === 'project'
        ? resolve(existingState.workspaceRoot ?? process.cwd())
        : undefined;
      writeHookInstallState({
        scope: repairedScope,
        workspaceRoot: repairedRoot,
        hookCommand,
        installedAt: existingState.installedAt,
        statuslineMode: existingState.statuslineMode,
      });
      repairs.push('normalized_hook_registration');
    } else if (hasLazyBrainHookRegistration(settings)) {
      repairs.push('metadata_missing_manual_reinstall_required');
    }

    const cleaned = cleanHookRuntimeRecords({ config });
    if (cleaned.staleRuns.length > 0) {
      repairs.push(`cleaned_stale_runs:${cleaned.staleRuns.length}`);
    }

    const runtimeBeforeReset = getHookRuntimeSnapshot({ config });
    if (runtimeBeforeReset.health.breakerUntil || runtimeBeforeReset.health.lastSkipReason === 'breaker_open') {
      clearHookBreaker();
      repairs.push('cleared_breaker');
    }
  }

  const installState = readHookInstallState();
  const runtime = getHookRuntimeSnapshot({ config });
  const runtimeStats = getHookRuntimeStats(runtime);
  const lifecycle = getHookLifecycleStatus(settings, { runtime });

  console.log('LazyBrain doctor');
  console.log(`  Mode: ${shouldFix ? 'diagnose+fix' : 'diagnose'}`);
  console.log(`  Install state: ${installState ? 'present' : 'missing'}`);
  console.log(`  Scope: ${installState?.scope ?? 'unknown'}`);
  if (installState?.workspaceRoot) {
    console.log(`  Workspace root: ${installState.workspaceRoot}`);
  }
  console.log(`  UserPromptSubmit installed: ${lifecycle.lazybrainUserPromptSubmit ? 'yes' : 'no'}`);
  console.log(`  Stop clean: ${lifecycle.lazybrainStop ? 'no' : 'yes'}`);
  console.log(`  Active hooks: ${runtime.activeRuns.length}`);
  console.log(`  Hung hooks: ${runtime.hungRuns.length}`);
  console.log(`  Stale hooks cleaned: ${runtime.staleRuns.length}`);
  console.log(`  Breaker: ${runtimeStats.breakerOpen ? 'OPEN' : 'closed'}`);
  console.log(`  Avg duration: ${runtimeStats.avgDurationMs}ms`);
  console.log(`  P95 duration: ${runtimeStats.p95DurationMs}ms`);
  console.log(`  Last skip reason: ${runtime.health.lastSkipReason ?? '(none)'}`);
  console.log(`  Last error: ${runtime.health.lastError ?? '(none)'}`);
  console.log(`  Budget checker: ${budgetCheckerState}`);
  if (shouldFix) {
    console.log(`  Repairs: ${repairs.length > 0 ? repairs.join(', ') : '(none)'}`);
    if (budgetCheckerState === 'enabled') {
      console.log('  Note: budget checker 已启用，但 doctor --fix 不会自动修改 LaunchAgent 状态。');
    }
  }
}

// ─── Server ───────────────────────────────────────────────────────────────

async function cmdServer() {
  const subCmd = args[1];

  if (subCmd === 'stop') {
    const pid = getServerPid();
    if (!pid) {
      console.log('Server is not running.');
      return;
    }
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`Server (pid ${pid}) stopped.`);
    } catch {
      console.error(`Failed to stop server (pid ${pid}). It may have already exited.`);
    }
    return;
  }

  if (subCmd === 'status') {
    if (isServerRunning()) {
      const port = getServerPort();
      const pid = getServerPid();
      console.log(`Server is running on http://127.0.0.1:${port} (pid ${pid})`);
    } else {
      console.log('Server is not running.');
    }
    return;
  }

  // Parse port
  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : DEFAULT_PORT;

  if (args.includes('--daemon')) {
    // Spawn detached child
    const child = spawn(process.execPath, [process.argv[1], 'server', '--port', String(port)], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    console.log(`Server started in background on http://127.0.0.1:${port} (pid ${child.pid})`);
    return;
  }

  // Foreground mode
  const instance = createServer(port);
  console.log(`LazyBrain server listening on http://127.0.0.1:${port}`);
  console.log('Press Ctrl+C to stop.');

  process.on('SIGINT', async () => {
    await instance.close();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await instance.close();
    process.exit(0);
  });

  // Keep process alive
  await new Promise<void>(() => {});
}

function cmdReport() {
  const sessionIdx = args.indexOf('--session');
  const sessionId = sessionIdx !== -1 ? args[sessionIdx + 1] : undefined;
  const showWeek = args.includes('--week');
  const showTopMissed = args.includes('--top-missed');
  const showTopUnexpected = args.includes('--top-unexpected');

  if (sessionId) {
    const report = generateReport(sessionId);
    console.log(`\nLazyBrain 准确率报告 — Session ${sessionId}`);
    console.log(`推荐工具：${report.recommendedTools.join(', ') || '（无）'}`);
    console.log(`实际使用：${report.actuallyUsedTools.join(', ') || '（无）'}`);
    console.log(`匹配：${report.matches.join(', ') || '（无）'}`);
    console.log(`错过：${report.missed.join(', ') || '（无）'}`);
    console.log(`意外：${report.unexpected.join(', ') || '（无）'}`);
    console.log(`准确率：${Math.round(report.accuracyScore * 100)}%`);
    return;
  }

  if (showTopMissed || showTopUnexpected) {
    const stats = computeWeeklyStats(7);
    if (showTopMissed) {
      console.log('\n最常被忽略的推荐（最近 7 天）：');
      if (stats.topMissed.length === 0) {
        console.log('  （暂无数据）');
      } else {
        for (let i = 0; i < stats.topMissed.length; i++) {
          const m = stats.topMissed[i];
          console.log(`  ${i + 1}. ${m.tool} — 推荐 ${m.recommended} 次，采纳 ${m.adopted} 次（${Math.round(m.rate * 100)}%）`);
        }
      }
    }
    if (showTopUnexpected) {
      console.log('\n系统盲点（最近 7 天）：');
      if (stats.topUnexpected.length === 0) {
        console.log('  （暂无数据）');
      } else {
        for (let i = 0; i < stats.topUnexpected.length; i++) {
          const u = stats.topUnexpected[i];
          console.log(`  ${i + 1}. ${u.tool} — 用户调 ${u.count} 次，系统从未推荐`);
        }
      }
    }
    return;
  }

  if (showWeek) {
    const stats = computeWeeklyStats(7);
    console.log(formatWeeklyReport(stats));
    return;
  }

  const stats = computeWeeklyStats(7);
  console.log(formatWeeklyReport(stats));
}

function cmdSummary() {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) {
    console.error('没有活动会话。`lazybrain summary` 需要 `CLAUDE_SESSION_ID` 环境变量。');
    process.exit(1);
  }
  const summary = buildSessionSummary(sessionId);
  const output = formatSessionSummary(summary);
  console.log(output);
}

// ─── Help ─────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
lazybrain — Semantic skill router for AI coding agents

Usage:
  lazybrain scan [--platform <p>]       Scan capability sources
  lazybrain compile [--offline]      Build knowledge graph (--offline: no LLM)
  lazybrain compile --with-relations Include Phase 2 relation inference (slow)
  lazybrain compile --all            Compile all platforms
  lazybrain compile --select         Interactive platform selection
  lazybrain compile --platform <p>   Compile specific platform only
  lazybrain compile --tier <n>       Compile specific tier (0/1/2)
  lazybrain match "<query>"          Match input to capabilities
  lazybrain list [--category <c>]    List indexed capabilities
  lazybrain stats                    Show graph statistics
  lazybrain graph [--mermaid] [--limit <n>] [--kind <k>] [--origin <o>] [--category <c>]
                                     Export graph view
  lazybrain alias set <n> <target>   Set an alias
  lazybrain alias list               List aliases
  lazybrain alias remove <name>      Remove an alias
  lazybrain config set <key> <val>   Set config value
  lazybrain config show              Show config
  lazybrain wiki                     Generate wiki articles
  lazybrain distill                  Distill user profile from history
  lazybrain server                   Start HTTP API server (foreground)
  lazybrain server --daemon          Start HTTP API server (background)
  lazybrain server --port <n>        Custom port (default: 18450)
  lazybrain server stop              Stop background server
  lazybrain server status            Check server status
  lazybrain hook status              Show LazyBrain hook lifecycle status
  lazybrain hook ps                  Show active LazyBrain hook runs
  lazybrain hook clean               Remove stale LazyBrain hook records
  lazybrain doctor [--fix]           Show runtime diagnostics and optional self-repair
  lazybrain summary                  Show manual session audit
  lazybrain --version                Show version
`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
