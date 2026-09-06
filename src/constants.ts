import { homedir } from 'node:os';
import { dirname, join, normalize, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { Platform } from './types.js';

export const LAZYBRAIN_DIR = process.env.LAZYBRAIN_DATA_DIR
  ? resolve(process.env.LAZYBRAIN_DATA_DIR)
  : join(homedir(), '.lazybrain');
export const GRAPH_PATH = join(LAZYBRAIN_DIR, 'graph.json');
export const HISTORY_PATH = join(LAZYBRAIN_DIR, 'history.jsonl');
export const GRAPH_VERSION = '2.0.0';

export function getClaudeConfigDir(): string {
  const configured = process.env.CLAUDE_CONFIG_DIR?.trim();
  if (!configured) return normalize(join(homedir(), '.claude'));
  if (configured === '~') return normalize(homedir());
  if (configured.startsWith('~/') || configured.startsWith('~\\')) return normalize(join(homedir(), configured.slice(2)));
  return normalize(configured);
}

export function getStatuslineChainPath(): string {
  return join(getClaudeConfigDir(), 'lazybrain-statusline-chain.json');
}

export function getCodexHome(): string {
  const configured = process.env.CODEX_HOME?.trim();
  return configured ? resolve(configured) : join(homedir(), '.codex');
}

function projectRoots(cwd: string): string[] {
  const start = resolve(cwd);
  const roots: string[] = [];
  let current = start;
  while (true) {
    roots.push(current);
    if (existsSync(join(current, '.git'))) return roots;
    const parent = dirname(current);
    if (parent === current) return [start];
    current = parent;
  }
}

export function inferSinglePlatformFromPath(filePath: string): Platform {
  if (filePath.includes('/.codex/')) return 'codex';
  if (filePath.includes('/.cursor/')) return 'cursor';
  if (filePath.includes('/.kiro/')) return 'kiro';
  if (filePath.includes('/.config/opencode/') || filePath.includes('/.opencode/')) return 'opencode';
  if (filePath.includes('/.agents/skills/')) return 'universal';
  if (filePath.includes('/.claude/')) return 'claude-code';
  return 'universal';
}

export function getDefaultScanPaths(platforms?: Record<string, boolean>, cwd: string = process.cwd()): string[] {
  const home = homedir();
  const claude = getClaudeConfigDir();
  const codex = getCodexHome();
  const includeClaude = platforms ? platforms['claude-code'] === true : true;
  const includeCodex = platforms ? platforms.codex === true : true;
  const paths: string[] = [];
  if (includeClaude) {
    paths.push(
      join(claude, 'skills'),
      join(claude, 'skills-disabled'),
      join(claude, 'commands'),
      join(claude, 'plugins'),
      join(home, '.claude.json'),
      join(home, '.skillshub'),
    );
  }
  if (includeCodex) {
    paths.push(
      join(codex, 'skills'),
      join(codex, 'commands'),
      join(codex, 'agents'),
      join(codex, 'plugins', 'cache'),
      join(codex, 'config.toml'),
      join(home, '.agents', 'skills'),
      join(home, '.agents', 'plugins', 'marketplace.json'),
    );
    for (const root of projectRoots(cwd)) {
      paths.push(join(root, '.agents', 'skills'), join(root, '.agents', 'plugins', 'marketplace.json'), join(root, '.codex', 'config.toml'), join(root, '.mcp.json'));
    }
  }
  if (platforms?.cursor) paths.push(join(home, '.cursor', 'rules'));
  if (platforms?.opencode) paths.push(join(home, '.config', 'opencode', 'skills'), join(home, '.opencode', 'skills'));
  return paths;
}

export const TRANSLATION_PATH_PATTERNS = [
  /\/docs\/zh-CN\//,
  /\/docs\/zh-TW\//,
  /\/docs\/ja-JP\//,
  /\/docs\/ko-KR\//,
  /\/docs\/pt-BR\//,
];

export function inferPlatformFromPath(filePath: string): Platform[] {
  const p = filePath.toLowerCase();
  if (p.includes('/.codex/')) return ['codex'];
  if (p.includes('/.cursor/')) return ['cursor'];
  if (p.includes('/.kiro/')) return ['kiro'];
  if (p.includes('/.config/opencode/') || p.includes('/.opencode/')) return ['opencode'];
  if (p.includes('/.agents/skills/')) return ['claude-code', 'codex', 'universal'];
  if (p.includes('/.claude/')) return ['claude-code'];
  return ['universal'];
}
