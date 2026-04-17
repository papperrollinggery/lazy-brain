/**
 * LazyBrain — OMC State Reader
 *
 * Reads `~/.omc/state/{mode}-state.json` to detect active OMC execution modes.
 * Used by statusline to display current execution context.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OMC_STATE_DIR } from '../constants.js';

export type OmcMode =
  | 'ralph'
  | 'ultrawork'
  | 'autopilot'
  | 'hud'
  | null;

interface OmcStateFile {
  active?: boolean;
  iteration?: number;
  max_iterations?: number;
  awaiting_confirmation?: boolean;
}

/** Mode priority (highest first) */
const MODE_FILES: Array<[string, OmcMode]> = [
  ['ralph-state.json', 'ralph'],
  ['ultrawork-state.json', 'ultrawork'],
  ['autopilot-state.json', 'autopilot'],
  ['hud-state.json', 'hud'],
];

/** State files older than 5 minutes are considered stale (OMC doesn't clean up on exit) */
const STATE_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Read OMC state directory, return the highest-priority active mode.
 * Returns null if no OMC mode is active or all state files are stale.
 */
export function readOmcMode(): OmcMode {
  for (const [filename, mode] of MODE_FILES) {
    const path = join(OMC_STATE_DIR, filename);
    try {
      if (existsSync(path)) {
        // Reject stale state files (OMC doesn't clean up on exit)
        const mtimeMs = statSync(path).mtimeMs;
        if (Date.now() - mtimeMs > STATE_MAX_AGE_MS) continue;

        const raw = readFileSync(path, 'utf-8');
        const state = JSON.parse(raw) as OmcStateFile;
        // active=true + awaiting_confirmation=true → completed, waiting for user input
        // active=true + awaiting_confirmation=false → actively working
        if (state.active === true && state.awaiting_confirmation !== true) return mode;
      }
    } catch {
      // File corrupted or unreadable — skip
    }
  }
  return null;
}
