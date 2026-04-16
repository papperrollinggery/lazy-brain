/**
 * LazyBrain — Constants
 *
 * Paths, thresholds, defaults, and model configuration.
 */

import { homedir } from 'node:os';
import { join, normalize } from 'node:path';
import type { Platform, UserConfig } from './types.js';

// ─── Paths ──────────────────────────────────────────────────────────────────

/** LazyBrain data directory */
export const LAZYBRAIN_DIR = join(homedir(), '.lazybrain');
export const GRAPH_PATH = join(LAZYBRAIN_DIR, 'graph.json');
export const CONFIG_PATH = join(LAZYBRAIN_DIR, 'config.json');
export const HISTORY_PATH = join(LAZYBRAIN_DIR, 'history.jsonl');
export const WIKI_DIR = join(LAZYBRAIN_DIR, 'wiki');
export const EXTERNAL_CATALOG_PATH = join(LAZYBRAIN_DIR, 'external-catalog.json');
export const PROFILE_PATH = join(LAZYBRAIN_DIR, 'profile.json');

/** OMC state directory — read to detect active execution mode */
export const OMC_STATE_DIR = join(homedir(), '.omc', 'state');
export const STATUS_PATH = join(LAZYBRAIN_DIR, 'status.json');
export const EMBEDDING_INDEX_PATH = join(LAZYBRAIN_DIR, 'index.bin');
export const MODELS_DIR = join(LAZYBRAIN_DIR, 'models');

/** Resolve Claude config dir (mirrors ~/.claude/hooks/lib/config-dir.mjs) */
export function getClaudeConfigDir(): string {
  const configured = process.env.CLAUDE_CONFIG_DIR?.trim();
  if (!configured) return normalize(join(homedir(), '.claude'));
  if (configured === '~') return normalize(homedir());
  if (configured.startsWith('~/') || configured.startsWith('~\\')) {
    return normalize(join(homedir(), configured.slice(2)));
  }
  return normalize(configured);
}

// ─── Default Scan Paths ─────────────────────────────────────────────────────

/** Infer primary platform from file path (single platform, not array) */
 export function inferSinglePlatformFromPath(filePath: string): Platform {
   if (filePath.includes('/.openclaw/')) return 'openclaw';
   if (filePath.includes('/.workbuddy/')) return 'workbuddy';
   if (filePath.includes('/.cursor/')) return 'cursor';
   if (filePath.includes('/.kiro/')) return 'kiro';
   return 'claude-code';
 }

/** Generate default scan paths based on Claude config dir */
export function getDefaultScanPaths(platforms?: Record<string, boolean>): string[] {
  const claude = getClaudeConfigDir();
  const home = homedir();
  const pf = platforms ?? { 'claude-code': true };
  const paths: string[] = [];

  if (pf['claude-code'] !== false) {
    paths.push(
      join(claude, 'skills'),
      join(claude, 'skills-disabled'),
      join(claude, '.agents', 'skills'),
      join(claude, 'agents'),
      join(claude, 'commands'),
      join(claude, 'ecc', 'skills'),
      join(claude, 'ecc', '.agents', 'skills'),
      join(claude, 'ecc', '.claude', 'skills'),
      join(claude, 'ecc', '.cursor', 'skills'),
      join(claude, 'ecc', '.kiro', 'skills'),
      join(claude, 'plugins'),
    );
  }

  if (pf['openclaw'] === true) {
    paths.push(
      join(home, '.openclaw', 'skills'),
      join(home, '.openclaw', 'agents'),
    );
  }

  if (pf['workbuddy'] === true) {
    paths.push(
      join(home, '.workbuddy', 'skills'),
    );
  }

  return paths;
}

/**
 * Path patterns that indicate translation/localization variants.
 * These should be skipped during deduplication.
 */
export const TRANSLATION_PATH_PATTERNS = [
  /\/docs\/zh-CN\//,
  /\/docs\/zh-TW\//,
  /\/docs\/ja-JP\//,
  /\/docs\/ko-KR\//,
  /\/docs\/tr\//,
  /\/docs\/pt-BR\//,
];

// ─── Platform Detection ─────────────────────────────────────────────────────

/** Infer platform compatibility from file path */
export function inferPlatformFromPath(filePath: string): Platform[] {
  const p = filePath.toLowerCase();
  if (p.includes('/.claw/') || p.includes('/claw/')) return ['openclaw'];
  if (p.includes('/.cursor/')) return ['cursor'];
  if (p.includes('/.kiro/')) return ['kiro'];
  if (p.includes('/.factory/')) return ['droid'];
  if (p.includes('/.config/opencode/')) return ['opencode'];
  if (p.includes('/.agents/skills/')) return ['claude-code', 'codex', 'universal'];
  if (p.includes('/.claude/')) return ['claude-code'];
  return ['universal'];
}

// ─── Thresholds ─────────────────────────────────────────────────────────────

/** Minimum score to include in results */
export const MIN_MATCH_SCORE = 0.3;
/** Default auto-trigger threshold */
export const DEFAULT_AUTO_THRESHOLD = 0.85;
/** Maximum results to return */
export const MAX_RESULTS = 5;
/** History boost cap (additive, not multiplicative) */
export const HISTORY_BOOST_CAP = 0.15;
/** External catalog refresh interval (ms) */
export const EXTERNAL_CATALOG_TTL = 24 * 60 * 60 * 1000; // 24h

// ─── Functional Categories ──────────────────────────────────────────────────

export const CATEGORIES = [
  'code-quality',       // review, lint, refactor, clean
  'testing',            // tdd, e2e, unit, coverage
  'development',        // patterns, frameworks, languages
  'deployment',         // ci-cd, pr, git, release
  'design',             // frontend, ui, ux, slides
  'planning',           // plan, blueprint, prd, architecture
  'research',           // search, docs, analysis
  'operations',         // devops, monitoring, infra
  'security',           // scan, audit, compliance
  'content',            // writing, docs, video, media
  'data',               // database, migration, analytics
  'orchestration',      // agent, team, workflow, mode
  'learning',           // continuous-learning, instinct, evolve
  'communication',      // email, slack, notifications
  'other',
] as const;

export type Category = typeof CATEGORIES[number];

// ─── Default Config ─────────────────────────────────────────────────────────

export const DEFAULT_CONFIG: UserConfig = {
  aliases: {},
  scanPaths: [],
  mode: 'select',
  autoThreshold: DEFAULT_AUTO_THRESHOLD,
  engine: 'tag',
  compileApiBase: 'https://api.siliconflow.cn/v1',
  compileModel: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
  embeddingApiBase: 'https://api.siliconflow.cn/v1',
  embeddingModel: 'BAAI/bge-m3',
  secretaryApiBase: 'https://api.siliconflow.cn/v1',
  secretaryModel: 'Qwen/Qwen2.5-7B-Instruct',
  externalDiscovery: false,
  platform: 'claude-code',
  language: 'auto',
  platforms: { 'claude-code': true, 'openclaw': false, 'workbuddy': false },
};

// ─── Graph Version ──────────────────────────────────────────────────────────

export const GRAPH_VERSION = '1.0.0';

// ─── Secretary Layer ─────────────────────────────────────────────────────────

export const SECRETARY_THRESHOLD = 0.85;
export const SECRETARY_LOW_THRESHOLD = 0.5;
export const SECRETARY_TIMEOUT_MS = 5000;
export const SECRETARY_RATE_LIMIT_MS = 30000;
export const SECRETARY_CONTEXT_SIZE = 20;
export const SECRETARY_CONTEXT_TOKENS = 1200;
export const SECRETARY_CIRCUIT_BREAKER_THRESHOLD = 3;
export const SECRETARY_CIRCUIT_BREAKER_PAUSE_MS = 600000;

// ─── Tag RRF Boost (for reciprocal rank fusion) ───────────────────────────────
export const TAG_RRF_BOOST = 1.0;

// ─── Capability Model Hints ─────────────────────────────────────────────────

export const CAPABILITY_MODEL_HINTS: Record<string, string> = {
  'santa-loop': 'claude-opus-4-6',
  'ccg': 'claude-opus-4-6',
  'ultrawork': 'claude-opus-4-6',
  'ralph': 'claude-opus-4-6',
  'deep-interview': 'claude-opus-4-6',
};
