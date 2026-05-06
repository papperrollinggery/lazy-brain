import { dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { STATUS_PATH } from '../constants.js';

export function readRuntimeStatus(path = STATUS_PATH): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function mergeRuntimeStatus(patch: Record<string, unknown>, path = STATUS_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ ...readRuntimeStatus(path), ...patch, updatedAt: Date.now() }));
}
