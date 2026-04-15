#!/usr/bin/env node
/**
 * LazyBrain statusline — reads last-match.json and renders one line
 * Registered in ~/.claude/settings.json as statusline command
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LAZYBRAIN_DIR } from '../src/constants.js';

const lastMatchPath = join(LAZYBRAIN_DIR, 'last-match.json');

function getLabel(): string {
  if (!existsSync(lastMatchPath)) return '🧠 待机中';
  try {
    const data = JSON.parse(readFileSync(lastMatchPath, 'utf-8'));
    if (Date.now() - data.updatedAt > 30_000) return '🧠 待机中';
    if (!data.tool) return '🧠 无匹配';
    const score = Math.round(data.score * 100);
    const boost = data.historyBoost > 0.01 ? ` ↑${Math.round(data.historyBoost * 100)}%` : '';
    return `🧠 /${data.tool} [${score}%]${boost}`;
  } catch {
    return '🧠 LazyBrain';
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
