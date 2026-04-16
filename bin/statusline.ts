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

  if (!existsSync(lastMatchPath)) return `🧠 待机中${suffix}`;
  try {
    const data = JSON.parse(readFileSync(lastMatchPath, 'utf-8'));
    if (Date.now() - data.updatedAt > 30_000) return `🧠 待机中${suffix}`;
    if (!data.tool) return `🧠 无匹配${suffix}`;
    const score = Math.round(data.score * 100);
    const boost = data.historyBoost > 0.01 ? ` ↑${Math.round(data.historyBoost * 100)}%` : '';
    return `🧠 /${data.tool} [${score}%]${boost}${suffix}`;
  } catch {
    return `🧠 LazyBrain${suffix}`;
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
