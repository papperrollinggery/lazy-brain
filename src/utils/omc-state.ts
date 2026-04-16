/**
 * LazyBrain — OMC State Reader
 *
 * Reads `~/.omc/state/{mode}-state.json` to detect active OMC execution modes.
 * Used by statusline to display current execution context.
 */

import { existsSync, readFileSync } from 'node:fs';
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
const MODE_FILES: Array<[Omit<Parameters<typeof join>[2], string>, OmcMode]> = [
  ['ralph-state.json', 'ralph'],
  ['ultrawork-state.json', 'ultrawork'],
  ['autopilot-state.json', 'autopilot'],
  ['hud-state.json', 'hud'],
];

/**
 * Read OMC state directory, return the highest-priority active mode.
 * Returns null if no OMC mode is active.
 */
export function readOmcMode(): OmcMode {
  for (const [filename, mode] of MODE_FILES) {
    const path = join(OMC_STATE_DIR, filename);
    try {
      if (existsSync(path)) {
        const raw = readFileSync(path, 'utf-8');
        const state = JSON.parse(raw) as OmcStateFile;
        if (state.active === true) return mode;
      }
    } catch {
      // File corrupted or unreadable — skip
    }
  }
  return null;
}
