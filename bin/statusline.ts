#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LAZYBRAIN_DIR } from '../src/constants.js';

interface LastMatch {
  tool?: string;
  score?: number;
  timestamp?: string;
}

function loadLastMatch(): LastMatch | null {
  const path = join(LAZYBRAIN_DIR, 'last-match.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as LastMatch;
  } catch {
    return null;
  }
}

function isFresh(timestamp?: string): boolean {
  if (!timestamp) return false;
  const ageMs = Date.now() - Date.parse(timestamp);
  return Number.isFinite(ageMs) && ageMs <= 5 * 60 * 1000;
}

function main(): void {
  const match = loadLastMatch();
  if (!match?.tool || !isFresh(match.timestamp) || (match.score ?? 0) < 0.75) return;
  process.stdout.write(`💡 /${match.tool}\n`);
}

main();
