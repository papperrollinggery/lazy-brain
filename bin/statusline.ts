#!/usr/bin/env node
/**
 * LazyBrain statusline — reads last-match.json and status.json
 * Registered in ~/.claude/settings.json as statusline command
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LAZYBRAIN_DIR, STATUS_PATH } from '../src/constants.js';
import { readOmcMode } from '../src/utils/omc-state.js';

const lastMatchPath = join(LAZYBRAIN_DIR, 'last-match.json');
const hookActivePath = join(LAZYBRAIN_DIR, '.hook-pid');

function isHookRunning(): boolean {
  try {
    if (!existsSync(hookActivePath)) return false;
    const pid = parseInt(readFileSync(hookActivePath, 'utf-8').trim(), 10);
    if (isNaN(pid)) return false;
    // Node.js: process.kill(pid, 0) checks if process exists — works on Unix/macOS
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getModel(): string {
  try {
    if (existsSync(lastMatchPath)) {
      const data = JSON.parse(readFileSync(lastMatchPath, 'utf-8'));
      return data.model ?? '';
    }
  } catch {}
  return '';
}

function getCompileStatus(): string | null {
  try {
    if (existsSync(STATUS_PATH)) {
      const data = JSON.parse(readFileSync(STATUS_PATH, 'utf-8'));
      const fiveMin = 5 * 60 * 1000;
      if (Date.now() - data.updatedAt > fiveMin) return null;
      if (data.state === 'compiling') return `编译中 ${data.progress}`;
      if (data.state === 'scanning') return '扫描中...';
    }
  } catch {}
  return null;
}

/**
 * Format a time duration string from milliseconds.
 * e.g. 5000 → "5秒前", 90000 → "1分30秒前", 7200000 → "2小时前"
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

const OMC_MODE_LABELS: Record<string, string> = {
  ralph: 'Ralph',
  ultrawork: 'Ultrawork',
  autopilot: 'Autopilot',
  hud: 'OMC',
};

function getLabel(): string {
  const model = getModel();
  const omcMode = readOmcMode();
  const omcSuffix = omcMode ? ` · ${OMC_MODE_LABELS[omcMode] ?? omcMode}` : '';
  const modelSuffix = model ? ` · ${model}` : '';
  const suffix = omcSuffix + modelSuffix;

  // 编译/扫描状态优先
  const compileStatus = getCompileStatus();
  if (compileStatus) return `🧠 ${compileStatus}${suffix}`;

  // Hook 正在运行 = LazyBrain 正在思考
  if (isHookRunning()) return `🧠 思考中${suffix}`;

  if (!existsSync(lastMatchPath)) return `🧠 监控中${suffix}`;
  try {
    const data = JSON.parse(readFileSync(lastMatchPath, 'utf-8'));
    const age = Date.now() - data.updatedAt;
    const timeLabel = timeAgo(age);
    if (!data.tool) return `🧠 监控中${suffix}`;
    const score = Math.round(data.score * 100);
    const boost = data.historyBoost > 0.01 ? ` ↑${Math.round(data.historyBoost * 100)}%` : '';
    return `🧠 ${timeLabel} /${data.tool} [${score}%]${boost}${suffix}`;
  } catch {
    return `🧠 监控中${suffix}`;
  }
}

function render() {
  // 支持两种模式：
  // --json  输出 {"label": "..."} 供 claude-hud --extra-cmd 使用
  // 默认    直接输出一行文字供独立 statusLine 使用
  const label = getLabel();
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ label }) + '\n');
  } else {
    process.stdout.write(label + '\n');
  }
}

render();
