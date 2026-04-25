/**
 * LazyBrain — Accuracy Report
 *
 * Compares hook-recommended tools vs actual tools used in a session,
 * and provides aggregate accuracy statistics.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseTranscript, extractUsedTools, loadRecommendationsForSession } from './tool-usage-tracker.js';

export interface AccuracyReport {
  sessionId: string;
  recommendedTools: string[];
  actuallyUsedTools: string[];
  matches: string[];
  missed: string[];
  unexpected: string[];
  accuracyScore: number;
}

export interface WeeklyStats {
  totalSessions: number;
  totalRecommendations: number;
  totalMatches: number;
  totalMissed: number;
  totalUnexpected: number;
  accuracyRate: number;
  topMissed: Array<{ tool: string; recommended: number; adopted: number; rate: number }>;
  topUnexpected: Array<{ tool: string; count: number }>;
}

/**
 * Find transcript path for a given session ID.
 * Claude Code stores transcripts in ~/.claude/sessions/<session-id>/transcript.jsonl
 */
function findTranscriptPath(sessionId: string, recommendations: RecommendationEntry[] = []): string | null {
  for (const rec of recommendations) {
    if (rec.transcriptPath && existsSync(rec.transcriptPath)) return rec.transcriptPath;
  }

  const base = join(homedir(), '.claude', 'sessions', sessionId);
  const candidates = [
    join(base, 'transcript.jsonl'),
    join(base, 'transcript'),
    join(homedir(), '.claude', 'transcripts', `${sessionId}.jsonl`),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  if (sessionId && sessionId !== 'unknown') {
    for (const root of [
      join(homedir(), '.claude', 'transcripts'),
      join(homedir(), '.claude', 'projects'),
    ]) {
      const found = findTranscriptFileByName(root, sessionId);
      if (found) return found;
    }
  }
  return null;
}

function findTranscriptFileByName(root: string, sessionId: string, depth = 0): string | null {
  if (depth > 4 || !existsSync(root)) return null;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return null;
  }

  for (const name of entries) {
    const path = join(root, name);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    if (stat.isFile() && name.endsWith('.jsonl') && name.includes(sessionId)) return path;
    if (stat.isDirectory()) {
      const found = findTranscriptFileByName(path, sessionId, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Normalize a tool identifier for comparison.
 * agent:executor → "agent:executor"
 * skill:deep-interview → "skill:deep-interview"
 * Bash → "Bash"
 */
export function normalizeTool(tool: string): string {
  return tool.toLowerCase();
}

/**
 * Generate an accuracy report for a given session.
 *
 * Steps:
 * 1. Load recommendation entries for the session from recommendations.jsonl
 * 2. Find and parse the transcript to extract actual tool usage
 * 3. Compare recommended vs actual
 */
export function generateReport(sessionId: string): AccuracyReport {
  const recommendations = loadRecommendationsForSession(sessionId);

  // Collect all recommended tools
  const recommendedSet = new Set<string>();
  for (const rec of recommendations) {
    for (const tool of rec.recommended) {
      recommendedSet.add(normalizeTool(tool));
    }
  }
  const recommendedTools = [...recommendedSet];

  // Parse transcript to get actual usage
  const transcriptPath = findTranscriptPath(sessionId, recommendations);
  let actuallyUsedTools: string[] = [];
  if (transcriptPath) {
    const events = parseTranscript(transcriptPath, sessionId);
    actuallyUsedTools = extractUsedTools(events).map(normalizeTool);
  }

  // Compute matches, missed, unexpected
  const matchSet = new Set<string>();
  const missedSet = new Set<string>();
  const unexpectedSet = new Set<string>();

  // Normalize actuallyUsedTools for set operations
  const usedSet = new Set<string>(actuallyUsedTools.map(normalizeTool));

  for (const tool of recommendedTools) {
    if (usedSet.has(tool)) {
      matchSet.add(tool);
    } else {
      missedSet.add(tool);
    }
  }

  for (const tool of actuallyUsedTools) {
    if (!recommendedSet.has(normalizeTool(tool))) {
      unexpectedSet.add(tool);
    }
  }

  const matches = [...matchSet];
  const missed = [...missedSet];
  const unexpected = [...unexpectedSet];

  const accuracyScore = recommendedTools.length > 0
    ? Math.round((matches.length / recommendedTools.length) * 1000) / 1000
    : 0;

  return {
    sessionId,
    recommendedTools,
    actuallyUsedTools,
    matches,
    missed,
    unexpected,
    accuracyScore,
  };
}

/**
 * Compute weekly aggregate statistics across all sessions.
 */
export function computeWeeklyStats(days = 7): WeeklyStats {
  const recommendations = loadAllRecommendations();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  // Filter to recent recommendations
  const recentRecs = recommendations.filter(r => r.timestamp >= cutoffStr);

  // Group by session
  const bySession = new Map<string, RecommendationEntry[]>();
  for (const rec of recentRecs) {
    if (!bySession.has(rec.sessionId)) {
      bySession.set(rec.sessionId, []);
    }
    bySession.get(rec.sessionId)!.push(rec);
  }

  const totalSessions = bySession.size;
  const toolMissedCounts = new Map<string, number>();
  const toolUnexpectedCounts = new Map<string, number>();

  let totalRecommendations = 0;
  let totalMatches = 0;
  let totalMissed = 0;
  let totalUnexpected = 0;

  for (const [sessionId, recs] of bySession) {
    // Aggregate recommended tools per session (dedup within session)
    const recSet = new Set<string>();
    for (const rec of recs) {
      for (const t of rec.recommended) {
        recSet.add(normalizeTool(t));
      }
    }
    const sessionRecs = [...recSet];
    totalRecommendations += sessionRecs.length;

    // Get actual tools used
    const transcriptPath = findTranscriptPath(sessionId, recs);
    const usedSet = new Set<string>();
    if (transcriptPath) {
      const events = parseTranscript(transcriptPath, sessionId);
      for (const t of extractUsedTools(events)) {
        usedSet.add(normalizeTool(t));
      }
    }

    // Count matches and missed
    let sessionMatches = 0;
    for (const t of sessionRecs) {
      if (usedSet.has(t)) {
        sessionMatches++;
      } else {
        toolMissedCounts.set(t, (toolMissedCounts.get(t) ?? 0) + 1);
      }
    }
    totalMatches += sessionMatches;
    totalMissed += sessionRecs.length - sessionMatches;

    // Count unexpected (used but not recommended in this session)
    for (const t of usedSet) {
      if (!recSet.has(t)) {
        toolUnexpectedCounts.set(t, (toolUnexpectedCounts.get(t) ?? 0) + 1);
        totalUnexpected++;
      }
    }
  }

  const accuracyRate = totalRecommendations > 0
    ? Math.round((totalMatches / totalRecommendations) * 1000) / 1000
    : 0;

  // Top missed: tools that were recommended most but adopted least
  const topMissed = [...toolMissedCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tool, missed]) => {
      // Count how many times this was recommended
      const recCount = [...bySession.values()].reduce((acc, recs) => {
        for (const rec of recs) {
          if (rec.recommended.some(t => normalizeTool(t) === tool)) acc++;
        }
        return acc;
      }, 0);
      const adopted = recCount - missed;
      return {
        tool,
        recommended: recCount,
        adopted,
        rate: recCount > 0 ? Math.round((adopted / recCount) * 100) / 100 : 0,
      };
    });

  const topUnexpected = [...toolUnexpectedCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tool, count]) => ({ tool, count }));

  return {
    totalSessions,
    totalRecommendations,
    totalMatches,
    totalMissed,
    totalUnexpected,
    accuracyRate,
    topMissed,
    topUnexpected,
  };
}

export type RecommendationEntry = { sessionId: string; timestamp: string; query: string; recommended: string[]; transcriptPath?: string };

export function loadAllRecommendations(): RecommendationEntry[] {
  const REC_PATH = join(homedir(), '.lazybrain', 'recommendations.jsonl');
  if (!existsSync(REC_PATH)) return [];
  try {
    const raw = readFileSync(REC_PATH, 'utf-8');
    return raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as RecommendationEntry);
  } catch {
    return [];
  }
}

/**
 * Format a WeeklyStats object as a readable report string.
 */
export function formatWeeklyReport(stats: WeeklyStats): string {
  const lines: string[] = [];
  lines.push('LazyBrain 推荐准确率报告（最近 7 天）');
  lines.push('');
  lines.push(`总 session：${stats.totalSessions}`);
  lines.push(`总推荐次数：${stats.totalRecommendations}`);
  lines.push(`推荐被采纳：${stats.totalMatches}（${Math.round(stats.accuracyRate * 100)}%）`);
  lines.push(`推荐被忽略：${stats.totalMissed}`);
  lines.push(`未被推荐但用了：${stats.totalUnexpected} 次`);
  lines.push('');
  lines.push('最常被忽略的推荐：');
  if (stats.topMissed.length === 0) {
    lines.push('  （暂无数据）');
  } else {
    for (let i = 0; i < stats.topMissed.length; i++) {
      const m = stats.topMissed[i];
      lines.push(`${i + 1}. ${m.tool} — 推荐 ${m.recommended} 次，采纳 ${m.adopted} 次（${Math.round(m.rate * 100)}%）`);
    }
  }
  lines.push('');
  lines.push('系统盲点（没推荐但用户手动调用）：');
  if (stats.topUnexpected.length === 0) {
    lines.push('  （暂无数据）');
  } else {
    for (let i = 0; i < stats.topUnexpected.length; i++) {
      const u = stats.topUnexpected[i];
      lines.push(`${i + 1}. ${u.tool} — 用户调 ${u.count} 次，系统从未推荐`);
    }
  }
  if (stats.topUnexpected.length > 0) {
    lines.push('');
    lines.push('建议：把这些盲点加入 exampleQueries');
  }
  return lines.join('\n');
}
