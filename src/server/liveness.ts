import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { LAZYBRAIN_DIR } from '../constants.js';

export const DEFAULT_PORT = 18450;
export const SERVER_RUNNING_FLAG = join(LAZYBRAIN_DIR, '.server-running');
export const SERVER_PID_FILE = join(LAZYBRAIN_DIR, 'server.pid');

export interface ServerLivenessPaths {
  runningFlagPath?: string;
  pidFilePath?: string;
}

export interface ServerRuntimeState {
  running: boolean;
  port: number;
  pid: number | null;
}

function runningFlagPath(paths?: ServerLivenessPaths): string {
  return paths?.runningFlagPath ?? SERVER_RUNNING_FLAG;
}

function pidFilePath(paths?: ServerLivenessPaths): string {
  return paths?.pidFilePath ?? SERVER_PID_FILE;
}

function cleanupServerMarkers(paths?: ServerLivenessPaths): void {
  try { unlinkSync(runningFlagPath(paths)); } catch {}
  try { unlinkSync(pidFilePath(paths)); } catch {}
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function getServerPort(paths?: ServerLivenessPaths): number {
  const path = runningFlagPath(paths);
  if (!existsSync(path)) return DEFAULT_PORT;
  const raw = readFileSync(path, 'utf-8').trim();
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : DEFAULT_PORT;
}

export function getServerPid(paths?: ServerLivenessPaths): number | null {
  const path = pidFilePath(paths);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf-8').trim();
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export function getServerRuntimeState(paths?: ServerLivenessPaths): ServerRuntimeState {
  const hasFlag = existsSync(runningFlagPath(paths));
  const pid = getServerPid(paths);
  const port = getServerPort(paths);
  const running = Boolean(hasFlag && pid && pidAlive(pid));
  if (!running && (hasFlag || pid !== null)) {
    cleanupServerMarkers(paths);
  }
  return { running, port, pid: running ? pid : null };
}

export function isServerRunning(paths?: ServerLivenessPaths): boolean {
  return getServerRuntimeState(paths).running;
}
