/**
 * LazyBrain — History Module
 *
 * 轻量级历史记录存储，使用 JSONL 格式追加写入。
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HistoryEntry } from '../types.js';
import { HISTORY_PATH } from '../constants.js';

export function loadRecentHistory(n: number): HistoryEntry[] {
  if (!existsSync(HISTORY_PATH)) return [];
  try {
    const lines = readFileSync(HISTORY_PATH, 'utf-8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l => JSON.parse(l) as HistoryEntry);
  } catch {
    return [];
  }
}

export function appendHistory(entry: HistoryEntry): void {
  try {
    const dir = dirname(HISTORY_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(HISTORY_PATH, JSON.stringify(entry) + '\n');
  } catch {
    // 写入失败不影响主流程
  }
}
