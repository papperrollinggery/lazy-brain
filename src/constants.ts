import { homedir } from 'node:os';
import { join, normalize } from 'node:path';
import type { Platform } from './types.js';

export const LAZYBRAIN_DIR = join(homedir(), '.lazybrain');
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

export function inferSinglePlatformFromPath(filePath: string): Platform {
  if (filePath.includes('/.codex/')) return 'codex';
  if (filePath.includes('/.cursor/')) return 'cursor';
  if (filePath.includes('/.kiro/')) return 'kiro';
  if (filePath.includes('/.config/opencode/') || filePath.includes('/.opencode/')) return 'opencode';
  if (filePath.includes('/.agents/skills/')) return 'universal';
  if (filePath.includes('/.claude/')) return 'claude-code';
  return 'universal';
}

export function getDefaultScanPaths(platforms?: Record<string, boolean>): string[] {
  const home = homedir();
  const claude = getClaudeConfigDir();
  const includeClaude = platforms ? platforms['claude-code'] === true : true;
  const paths: string[] = [];
  if (includeClaude) {
    paths.push(
      join(claude, 'skills'),
      join(claude, 'skills-disabled'),
      join(claude, 'commands'),
      join(home, '.skillshub'),
    );
  }
  if (platforms?.codex) paths.push(join(home, '.codex', 'skills'), join(home, '.codex', 'commands'));
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
