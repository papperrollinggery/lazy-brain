#!/usr/bin/env node
/**
 * LazyBrain statusline — reads last-match.json and status.json
 * Registered in ~/.claude/settings.json as statusline command
 *
 * Status priority (highest first):
 *   1. compile/scan in progress  → 编译中 / 扫描中
 *   2. hook running              → 思考中
 *   3. last-match available       → /tool [score%] with timeAgo
 *   4. no history / idle         → 待机中
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LAZYBRAIN_DIR, STATUS_PATH, HOOK_ACTIVE_PATH } from '../src/constants.js';
import { readOmcMode } from '../src/utils/omc-state.js';

const lastMatchPath = join(LAZYBRAIN_DIR, 'last-match.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Check if hook is currently running (PID file exists + process alive) */
function isHookRunning(): boolean {
  try {
    if (!existsSync(HOOK_ACTIVE_PATH)) return false;
    const pid = parseInt(readFileSync(HOOK_ACTIVE_PATH, 'utf-8').trim(), 10);
    if (isNaN(pid)) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Check if a compile/scan is in progress (status.json not stale) */
function getCompileStatus(): string | null {
  try {
    if (!existsSync(STATUS_PATH)) return null;
    const data = JSON.parse(readFileSync(STATUS_PATH, 'utf-8'));
    const fiveMin = 5 * 60 * 1000;
    if (Date.now() - data.updatedAt > fiveMin) return null;
    if (data.state === 'compiling') return `编译中 ${data.progress}`;
    if (data.state === 'scanning') return '扫描中';
  } catch {}
  return null;
}

/**
 * Format milliseconds as a relative time string.
 * < 0        → "刚刚"
 * < 60s      → "5秒前"
 * < 60min    → "3分前"
 * < 24h      → "2小时前"
 * ≥ 24h      → "2天前"
 */
function timeAgo(ms: number): string {
  if (ms < 0) return '刚刚';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}

/** Read last-match data, return null if missing or invalid */
function readLastMatch(): { tool: string; score: number; historyBoost: number; updatedAt: number } | null {
  try {
    if (!existsSync(lastMatchPath)) return null;
    const data = JSON.parse(readFileSync(lastMatchPath, 'utf-8'));
    if (!data || typeof data.updatedAt !== 'number') return null;
    return data as { tool: string; score: number; historyBoost: number; updatedAt: number };
  } catch {
    return null;
  }
}

const OMC_MODE_LABELS: Record<string, string> = {
  ralph: 'Ralph',
  ultrawork: 'Ultrawork',
  autopilot: 'Autopilot',
  hud: 'OMC',
};

// ─── Main ─────────────────────────────────────────────────────────────────────

function getLabel(): string {
  // ① OMC mode suffix (always appended)
  const omcMode = readOmcMode();
  const omcSuffix = omcMode ? ` · ${OMC_MODE_LABELS[omcMode] ?? omcMode}` : '';

  // ② 编译/扫描 — highest priority, replaces thinking state
  const compileStatus = getCompileStatus();
  if (compileStatus) return `🧠 ${compileStatus}${omcSuffix}`;

  // ③ Hook 运行中 — LazyBrain 正在处理 prompt
  if (isHookRunning()) return `🧠 思考中${omcSuffix}`;

  // ④ last-match 已有数据显示
  const last = readLastMatch();
  if (last) {
    const age = Date.now() - last.updatedAt;

    // 有匹配工具：显示工具名 + 评分
    if (last.tool) {
      const score = Math.round(last.score * 100);
      const boost = last.historyBoost > 0.01 ? ` ↑${Math.round(last.historyBoost * 100)}%` : '';

      if (age < 30_000) {
        // 刚匹配 (< 30s)：直接显示工具，不带时间
        return `🧠 /${last.tool} [${score}%]${boost}${omcSuffix}`;
      } else {
        // 匹配过，带时间差
        const timeLabel = timeAgo(age);
        // 超过 5 分钟不显示分数（防止误导 — 数据已旧）
        const scoreLabel = age < 5 * 60 * 1000 ? ` [${score}%]${boost}` : '';
        return `🧠 ${timeLabel} /${last.tool}${scoreLabel}${omcSuffix}`;
      }
    }

    // tool=null → 匹配过但没有合适候选（OmcModeQuery 等）或被 bypass
    // age < 5min 显示时间，否则待机
    if (age < 5 * 60 * 1000) {
      return `🧠 ${timeAgo(age)} 已跳过${omcSuffix}`;
    }
  }

  // ⑤ 无历史 / 超时 → 待机
  return `🧠 待机中${omcSuffix}`;
}

function render() {
  const label = getLabel();
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ label }) + '\n');
  } else {
    process.stdout.write(label + '\n');
  }
}

render();
