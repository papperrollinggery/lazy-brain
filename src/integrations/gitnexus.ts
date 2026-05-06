import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export interface GitNexusContext {
  metaPath: string;
  repoPath: string;
  repoName: string;
  indexedAt?: string;
  lastCommit?: string;
  stats?: {
    files?: number;
    nodes?: number;
    edges?: number;
    communities?: number;
    processes?: number;
    embeddings?: number;
  };
}

export interface GitNexusStatus extends GitNexusContext {
  available: boolean;
  source: 'local-meta';
  mcpRequired: false;
  state: 'missing' | 'current' | 'stale' | 'invalid' | 'unknown';
  currentCommit?: string;
  stale: boolean;
  contextUri?: string;
  artifactWarnings: string[];
}

export function findGitNexusContext(startDir = process.cwd()): GitNexusContext | undefined {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const metaPath = join(dir, '.gitnexus', 'meta.json');
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as {
          repoPath?: string;
          indexedAt?: string;
          lastCommit?: string;
          stats?: GitNexusContext['stats'];
        };
        const repoPath = meta.repoPath ?? dir;
        return {
          metaPath,
          repoPath,
          repoName: basename(repoPath),
          indexedAt: meta.indexedAt,
          lastCommit: meta.lastCommit,
          stats: meta.stats,
        };
      } catch {
        return { metaPath, repoPath: dir, repoName: basename(dir) };
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function readCurrentCommit(cwd: string): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

function gitNexusArtifactWarnings(repoPath: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(repoPath)
      .filter(name => name.startsWith('.gitnexus.') || name === '.gitnexus.wal.backup')
      .sort();
  } catch {
    return [];
  }
  if (entries.length === 0) return [];
  const shown = entries.slice(0, 8).map(name => `GitNexus artifact present: ${name}`);
  if (entries.length > shown.length) {
    shown.push(`GitNexus artifact present: ${entries.length - shown.length} more`);
  }
  return shown;
}

export function getGitNexusStatus(startDir = process.cwd()): GitNexusStatus {
  const context = findGitNexusContext(startDir);
  const repoPath = context?.repoPath ?? startDir;
  const currentCommit = readCurrentCommit(repoPath);
  const stale = Boolean(context?.lastCommit && currentCommit && context.lastCommit !== currentCommit);
  const invalid = Boolean(context && !context.indexedAt && !context.lastCommit && !context.stats);
  const state = !context
    ? 'missing'
    : invalid
      ? 'invalid'
    : stale
      ? 'stale'
      : context.lastCommit && currentCommit
        ? 'current'
        : 'unknown';
  return {
    metaPath: context?.metaPath ?? join(repoPath, '.gitnexus', 'meta.json'),
    repoPath,
    repoName: context?.repoName ?? basename(repoPath),
    indexedAt: context?.indexedAt,
    lastCommit: context?.lastCommit,
    stats: context?.stats,
    available: Boolean(context),
    source: 'local-meta',
    mcpRequired: false,
    state,
    currentCommit,
    stale,
    contextUri: context ? `gitnexus://repo/${context.repoName}/context` : undefined,
    artifactWarnings: gitNexusArtifactWarnings(repoPath),
  };
}

export function gitNexusSkillNamesForRoute(query: string, comboId?: string, categories: string[] = []): string[] {
  const q = query.toLowerCase();
  const categoryText = categories.join(' ').toLowerCase();
  const wantsReview = comboId === 'code_review_regression' || /\b(pr|pull request|review|regression)\b|审查|审核|回归|风险/.test(q);
  const wantsImpact = /\b(impact|blast radius|depends|dependency|break|risk)\b|影响|依赖|会坏|风险/.test(q);
  const wantsDebug = comboId === 'debug_crash' || comboId === 'debug_stuck_runtime' || /\b(debug|bug|crash|error|failing|broken)\b|调试|排查|报错|崩溃|失败/.test(q);
  const wantsRefactor = comboId === 'refactor_clean' || /\b(refactor|cleanup|rename|extract|split)\b|重构|清理|改名|拆分/.test(q);
  const names: string[] = [];
  if (wantsReview || categoryText.includes('code-quality')) names.push('gitnexus-pr-review');
  if (wantsImpact) names.push('gitnexus-impact-analysis');
  if (wantsDebug) names.push('gitnexus-debugging');
  if (wantsRefactor) names.push('gitnexus-refactoring');
  return [...new Set(names)];
}
