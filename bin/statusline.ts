#!/usr/bin/env node
/**
 * LazyBrain statusline — reads last-match.json and status.json
 * Registered in ~/.claude/settings.json as statusline command
 *
 * Status priority (highest first):
 *   1. compile/scan in progress  → 编译中 / 扫描中
 *   2. hook running              → 思考中
 *   3. last-match available       → /tool [score%] with timeAgo
 *   4. no history / idle          → 待机中
 *
 * Visual convention:
 *   - Active states (hooked/matched): bold
 *   - Dormant state (待机中): dimmed to signal idle
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { LAZYBRAIN_DIR, STATUS_PATH, HOOK_ACTIVE_PATH, HOOK_RUNS_DIR, getStatuslineChainPath } from '../src/constants.js';
import { readOmcMode } from '../src/utils/omc-state.js';
import { simplifyUpstreamHud, isLowSignalLazyBrainLabel } from '../src/utils/hud-normalizer.js';

// ─── ANSI styling ───────────────────────────────────────────────────────────────

const DIM  = '\x1b[2m';
const BOLD = '\x1b[1m';
const RST  = '\x1b[0m';

function active(label: string): string  { return `${BOLD}${label}${RST}`; }
function dormant(label: string): string { return `${DIM}${label}${RST}`; }

const lastMatchPath = join(LAZYBRAIN_DIR, 'last-match.json');

interface ChainConfig {
  upstreamCommand?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readStdin(): string {
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function readChainConfig(): ChainConfig {
  const explicitChainPath = process.env.LAZYBRAIN_STATUSLINE_CHAIN;
  const candidates = explicitChainPath
    ? [explicitChainPath]
    : [getStatuslineChainPath(), `${process.env.HOME ?? ''}/.lazybrain/statusline-chain.json`];

  for (const chainPath of candidates) {
    try {
      if (!chainPath || !existsSync(chainPath)) continue;
      return JSON.parse(readFileSync(chainPath, 'utf-8')) as ChainConfig;
    } catch {}
  }

  return {};
}

function runCommand(command: string, stdin: string): string {
  if (command.includes('statusline.js') || command.includes('statusline-combined.js')) return '';
  try {
    return execSync(command, {
      input: stdin,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 5000,
      env: process.env,
    }).trim();
  } catch {
    return '';
  }
}

/** Check if hook is currently running (PID file exists + process alive) */
function isHookRunning(): boolean {
  try {
    if (existsSync(HOOK_RUNS_DIR)) {
      for (const name of readdirSync(HOOK_RUNS_DIR)) {
        if (!name.endsWith('.json')) continue;
        const run = JSON.parse(readFileSync(join(HOOK_RUNS_DIR, name), 'utf-8')) as { pid?: unknown };
        if (typeof run.pid !== 'number') continue;
        try {
          process.kill(run.pid, 0);
          return true;
        } catch {}
      }
    }
  } catch {}
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
    if (data.state === 'embedding') return `Embedding ${data.progress ?? ''}`.trim();
  } catch {}
  return null;
}

/**
 * Format milliseconds as a relative time string.
 * < 0        → "刚刚"
 * < 60s      → "5秒前"
 * < 60min    → "3分前"
 * < 24h      → "2小时前"
 * >= 24h     → "2天前"
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
function readLastMatch(): { tool: string | null; score: number; historyBoost: number; updatedAt: number; state?: string } | null {
  try {
    if (!existsSync(lastMatchPath)) return null;
    const data = JSON.parse(readFileSync(lastMatchPath, 'utf-8'));
    if (!data || typeof data.updatedAt !== 'number') return null;
    return data as { tool: string | null; score: number; historyBoost: number; updatedAt: number; state?: string };
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
  // (1) OMC mode suffix (always appended)
  const omcMode = readOmcMode();
  const omcSuffix = omcMode ? ` · ${OMC_MODE_LABELS[omcMode] ?? omcMode}` : '';

  // (2) compile/scan — highest priority
  const compileStatus = getCompileStatus();
  if (compileStatus) return active(`\u{1F9E0} ${compileStatus}${omcSuffix}`);

  // (3) hook running
  if (isHookRunning()) return active(`\u{1F9E0} 思考中${omcSuffix}`);

  // (4) last-match data
  const last = readLastMatch();
  if (last) {
    const age = Date.now() - last.updatedAt;
    const fiveMin = 5 * 60 * 1000;

    if (last.tool && (last.state ?? 'matched') === 'matched' && age < fiveMin) {
      const score = Math.round(last.score * 100);
      const boost = last.historyBoost > 0.01 ? ` ↑${Math.round(last.historyBoost * 100)}%` : '';

      if (age < 30_000) {
        return active(`\u{1F9E0} /${last.tool} [${score}%]${boost}${omcSuffix}`);
      } else {
        const timeLabel = timeAgo(age);
        return active(`\u{1F9E0} ${timeLabel} /${last.tool} [${score}%]${boost}${omcSuffix}`);
      }
    }

    if (!last.tool && age < fiveMin) {
      return active(`\u{1F9E0} ${timeAgo(age)} 已跳过${omcSuffix}`);
    }
  }

  // (6) idle — dimmed to distinguish from active states
  return dormant(`\u{1F9E0} 待机中${omcSuffix}`);
}

function render() {
  const stdin = readStdin();
  const label = getLabel();
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ label }) + '\n');
    return;
  }

  if (process.env.LAZYBRAIN_STATUSLINE_LABEL_ONLY !== '1') {
    const upstreamCommand = readChainConfig().upstreamCommand?.trim();
    const upstream = upstreamCommand ? simplifyUpstreamHud(runCommand(upstreamCommand, stdin)) : '';
    if (upstream) {
      process.stdout.write(isLowSignalLazyBrainLabel(label) ? `${upstream}\n` : `${upstream}  ${label}\n`);
      return;
    }
  }

  process.stdout.write(label + '\n');
}

render();
