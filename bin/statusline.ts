#!/usr/bin/env node
/**
 * LazyBrain statusline — reads last-match.json and renders one line
 * Registered in ~/.claude/settings.json as statusline command
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LAZYBRAIN_DIR } from '../src/constants.js';

const lastMatchPath = join(LAZYBRAIN_DIR, 'last-match.json');

function render() {
  if (!existsSync(lastMatchPath)) {
    process.stdout.write('🧠 LazyBrain 待机中\n');
    return;
  }

  try {
    const data = JSON.parse(readFileSync(lastMatchPath, 'utf-8'));

    if (Date.now() - data.updatedAt > 30_000) {
      process.stdout.write('🧠 LazyBrain 待机中\n');
      return;
    }

    if (!data.tool) {
      process.stdout.write('🧠 LazyBrain 无匹配\n');
      return;
    }

    const score = Math.round(data.score * 100);
    const boost = data.historyBoost > 0.01 ? ` ↑${Math.round(data.historyBoost * 100)}%` : '';
    process.stdout.write(`🧠 /${data.tool}  [${score}%]${boost}\n`);
  } catch {
    process.stdout.write('🧠 LazyBrain\n');
  }
}

render();
