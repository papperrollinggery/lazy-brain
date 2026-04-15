/**
 * LazyBrain — User Profile Distiller
 *
 * 从 history.jsonl 蒸馏用户画像：
 * - 工具亲和度（频次 + 接受率 + 最近使用）
 * - 任务链模式（session 内连续使用的工具序列）
 * - 能力信号（高级工具占比）
 *
 * 蒸馏结果写入 profile.json，secretary 直接读取，不用每次实时聚合。
 * 触发时机：lazybrain distill / hook 检测到 profile 过期（>24h）
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { HistoryEntry, UserProfile, ToolAffinity, TaskChain, MatchLayer } from '../types.js';
import { PROFILE_PATH } from '../constants.js';

/** 高级工具关键词——用这些工具多说明用户是高级用户 */
const ADVANCED_TOOL_PATTERNS = [
  'architect', 'refactor', 'santa-loop', 'ultrawork', 'deep-interview',
  'ccg', 'ralph', 'tdd', 'security', 'perf',
];

/** session 间隔阈值：超过 30 分钟算新 session */
const SESSION_GAP_MS = 30 * 60 * 1000;

export function distillProfile(history: HistoryEntry[]): UserProfile {
  if (history.length === 0) {
    return {
      distilledAt: new Date().toISOString(),
      eventCount: 0,
      toolAffinities: [],
      taskChains: [],
      preferredLayer: 'tag',
      advancedToolRatio: 0,
    };
  }

  // ─── 1. 工具亲和度 ──────────────────────────────────────────────────────
  const toolStats = new Map<string, { uses: number; accepted: number; lastUsed: string; id?: string }>();
  for (const entry of history) {
    const key = entry.matched;
    const s = toolStats.get(key) ?? { uses: 0, accepted: 0, lastUsed: entry.timestamp, id: entry.id };
    s.uses++;
    if (entry.accepted) s.accepted++;
    if (entry.timestamp > s.lastUsed) s.lastUsed = entry.timestamp;
    if (entry.id) s.id = entry.id;
    toolStats.set(key, s);
  }

  const toolAffinities: ToolAffinity[] = [...toolStats.entries()]
    .map(([name, s]) => ({
      name,
      id: s.id,
      totalUses: s.uses,
      acceptRate: s.uses > 0 ? s.accepted / s.uses : 0,
      lastUsed: s.lastUsed,
      rejectCount: s.uses - s.accepted,
    }))
    .sort((a, b) => b.totalUses - a.totalUses);

  // ─── 2. 任务链提取 ──────────────────────────────────────────────────────
  // 按 session 分组（30 分钟间隔），提取连续工具序列
  const sessions: string[][] = [];
  let currentSession: string[] = [];
  let lastTs = 0;

  for (const entry of history) {
    if (!entry.accepted) continue;
    const ts = new Date(entry.timestamp).getTime();
    if (lastTs > 0 && ts - lastTs > SESSION_GAP_MS) {
      if (currentSession.length >= 2) sessions.push(currentSession);
      currentSession = [];
    }
    currentSession.push(entry.matched);
    lastTs = ts;
  }
  if (currentSession.length >= 2) sessions.push(currentSession);

  // 统计 2-3 长度的子序列
  const chainCounts = new Map<string, number>();
  for (const session of sessions) {
    for (let len = 2; len <= Math.min(3, session.length); len++) {
      for (let i = 0; i <= session.length - len; i++) {
        const chain = session.slice(i, i + len);
        // 去重连续相同工具
        if (new Set(chain).size < 2) continue;
        const key = chain.join(' → ');
        chainCounts.set(key, (chainCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const taskChains: TaskChain[] = [...chainCounts.entries()]
    .filter(([, count]) => count >= 2)  // 至少出现 2 次才算模式
    .map(([key, count]) => ({ sequence: key.split(' → '), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // ─── 3. 偏好 layer ──────────────────────────────────────────────────────
  const layerCounts = new Map<MatchLayer, number>();
  for (const entry of history) {
    layerCounts.set(entry.layer, (layerCounts.get(entry.layer) ?? 0) + 1);
  }
  const preferredLayer = [...layerCounts.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'tag';

  // ─── 4. 能力信号 ──────────────────────────────────────────────────────
  const advancedUses = history.filter(e =>
    e.accepted && ADVANCED_TOOL_PATTERNS.some(p => e.matched.toLowerCase().includes(p)),
  ).length;
  const totalAccepted = history.filter(e => e.accepted).length;
  const advancedToolRatio = totalAccepted > 0 ? advancedUses / totalAccepted : 0;

  return {
    distilledAt: new Date().toISOString(),
    eventCount: history.length,
    toolAffinities,
    taskChains,
    preferredLayer,
    advancedToolRatio,
  };
}

/** 蒸馏并写入 profile.json */
export function distillAndSave(history: HistoryEntry[]): UserProfile {
  const profile = distillProfile(history);
  writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));
  return profile;
}

/** 读取已蒸馏的 profile，不存在返回 null */
export function loadProfile(): UserProfile | null {
  if (!existsSync(PROFILE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(PROFILE_PATH, 'utf-8')) as UserProfile;
  } catch {
    return null;
  }
}

/** profile 是否过期（默认 24h） */
export function isProfileStale(maxAgeMs = 24 * 60 * 60 * 1000): boolean {
  const profile = loadProfile();
  if (!profile) return true;
  return Date.now() - new Date(profile.distilledAt).getTime() > maxAgeMs;
}
