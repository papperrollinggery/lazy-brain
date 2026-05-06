#!/usr/bin/env node
/**
 * LazyBrain statusline — reads last-match.json and status.json
 * Registered in ~/.claude/settings.json as statusline command
 *
 * Status priority (highest first):
 *   1. compile/scan in progress  → 编译中 / 扫描中
 *   2. hook running              → 思考中
 *   3. recent route event         → route combo [score%] with timeAgo
 *   4. stale route event          → 上次 route combo with timeAgo
 *   5. last-match available       → /tool [score%] with timeAgo
 *   6. no history / idle          → 待机中
 *
 * Visual convention:
 *   - Active states (hooked/matched/routing): bold
 *   - Dormant state (待机中): dimmed to signal idle
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LAZYBRAIN_DIR, STATUS_PATH, HOOK_ACTIVE_PATH, HOOK_RUNS_DIR, ROUTE_EVENTS_PATH } from '../src/constants.js';
import { readOmcMode } from '../src/utils/omc-state.js';
import { getGitNexusStatus } from '../src/integrations/gitnexus.js';

// ─── ANSI styling ───────────────────────────────────────────────────────────────

const DIM  = '\x1b[2m';
const BOLD = '\x1b[1m';
const RST  = '\x1b[0m';

function active(label: string): string  { return `${BOLD}${label}${RST}`; }
function dormant(label: string): string { return `${DIM}${label}${RST}`; }

const lastMatchPath = join(LAZYBRAIN_DIR, 'last-match.json');
const routeEventsPath = process.env.LAZYBRAIN_ROUTE_EVENTS_PATH?.trim() || ROUTE_EVENTS_PATH;
const RECENT_STATUS_WINDOW_MS = 5 * 60 * 1000;

type RouteEventMode = 'route_plan' | 'needs_clarification' | 'no_route_needed';
type RouteEventSource = 'cli' | 'api' | 'hook-gate' | 'prompt' | 'mcp';

interface RouteEvent {
  timestamp: string;
  source?: RouteEventSource;
  mode: RouteEventMode;
  intent?: string;
  combo?: string;
  recommendedChoice?: {
    id?: string;
    label?: string;
    confidence?: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function parseRouteEvent(line: string): RouteEvent | null {
  try {
    const event = JSON.parse(line) as RouteEvent;
    if (!event.timestamp || !event.mode) return null;
    return event;
  } catch {
    return null;
  }
}

function routeSourceLabel(source: RouteEventSource | undefined): string {
  if (source === 'hook-gate') return 'hook';
  if (source === 'prompt') return 'prompt';
  if (source === 'api') return 'api';
  if (source === 'mcp') return 'mcp';
  return 'cli';
}

function routeEventName(event: RouteEvent): string {
  return event.combo ?? event.recommendedChoice?.label ?? event.intent ?? 'route';
}

function routeEventScore(event: RouteEvent): string {
  const confidence = event.recommendedChoice?.confidence;
  return typeof confidence === 'number' && Number.isFinite(confidence)
    ? ` [${Math.round(confidence * 100)}%]`
    : '';
}

function routeEventLabel(event: RouteEvent): string {
  return `${routeSourceLabel(event.source)} ${routeEventName(event)}${routeEventScore(event)}`;
}

function readRecentRouteEvent(): { event: RouteEvent; age: number } | null {
  try {
    if (!existsSync(routeEventsPath)) return null;
    const lines = readFileSync(routeEventsPath, 'utf-8').trim().split('\n');
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (!line) continue;
      const event = parseRouteEvent(line);
      if (!event) continue;
      const timestamp = Date.parse(event.timestamp);
      if (!Number.isFinite(timestamp)) continue;
      const age = Date.now() - timestamp;
      return { event, age };
    }
  } catch {}
  return null;
}

const OMC_MODE_LABELS: Record<string, string> = {
  ralph: 'Ralph',
  ultrawork: 'Ultrawork',
  autopilot: 'Autopilot',
  hud: 'OMC',
};

function shortCommit(value: string | undefined): string {
  return value ? value.slice(0, 7) : '?';
}

function gitNexusSuffix(): string {
  const status = getGitNexusStatus();
  if (!status.available) return '';
  if (status.stale) return ` · 图谱待刷新 ${shortCommit(status.lastCommit)}→${shortCommit(status.currentCommit)}`;
  if (status.state === 'current') return ' · 图谱已同步';
  if (status.state === 'invalid') return ' · 图谱异常';
  return '';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function getLabel(): string {
  // (1) OMC mode suffix (always appended)
  const omcMode = readOmcMode();
  const omcSuffix = `${omcMode ? ` · ${OMC_MODE_LABELS[omcMode] ?? omcMode}` : ''}${gitNexusSuffix()}`;

  // (2) compile/scan — highest priority
  const compileStatus = getCompileStatus();
  if (compileStatus) return active(`\u{1F9E0} ${compileStatus}${omcSuffix}`);

  // (3) hook running
  if (isHookRunning()) return active(`\u{1F9E0} 思考中${omcSuffix}`);

  // (4) recent route event. This covers CLI/API/MCP/Prompt usage, not only hooks.
  const recentRouteEvent = readRecentRouteEvent();
  if (recentRouteEvent?.event.mode === 'route_plan') {
    const event = recentRouteEvent.event;
    if (recentRouteEvent.age <= RECENT_STATUS_WINDOW_MS) {
      return active(`\u{1F9E0} ${timeAgo(recentRouteEvent.age)} ${routeEventLabel(event)}${omcSuffix}`);
    }
    return dormant(`\u{1F9E0} 上次 ${timeAgo(recentRouteEvent.age)} ${routeEventLabel(event)}${omcSuffix}`);
  }
  if (recentRouteEvent?.event.mode === 'needs_clarification') {
    if (recentRouteEvent.age > RECENT_STATUS_WINDOW_MS) return dormant(`\u{1F9E0} 上次 ${timeAgo(recentRouteEvent.age)} 需澄清${omcSuffix}`);
    return active(`\u{1F9E0} ${timeAgo(recentRouteEvent.age)} 需澄清${omcSuffix}`);
  }
  if (recentRouteEvent?.event.mode === 'no_route_needed') {
    if (recentRouteEvent.age > RECENT_STATUS_WINDOW_MS) return dormant(`\u{1F9E0} 上次 ${timeAgo(recentRouteEvent.age)} 直达${omcSuffix}`);
    return active(`\u{1F9E0} ${timeAgo(recentRouteEvent.age)} 直达${omcSuffix}`);
  }

  // (5) last-match data
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
  const label = getLabel();
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ label }) + '\n');
  } else {
    process.stdout.write(label + '\n');
  }
}

render();
