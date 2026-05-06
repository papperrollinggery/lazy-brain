import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, getServerPort, getServerRuntimeState } from '../../src/server/liveness.js';

function paths(dir: string) {
  return {
    runningFlagPath: join(dir, '.server-running'),
    pidFilePath: join(dir, 'server.pid'),
  };
}

describe('server liveness markers', () => {
  it('treats stale marker files as not running and cleans them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-liveness-stale-'));
    const p = paths(dir);
    writeFileSync(p.runningFlagPath, '18450', 'utf-8');
    writeFileSync(p.pidFilePath, '99999999', 'utf-8');

    const state = getServerRuntimeState(p);

    expect(state.running).toBe(false);
    expect(state.pid).toBeNull();
    expect(state.port).toBe(18450);
    expect(existsSync(p.runningFlagPath)).toBe(false);
    expect(existsSync(p.pidFilePath)).toBe(false);
  });

  it('requires both a marker file and a live pid', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-liveness-live-'));
    const p = paths(dir);
    writeFileSync(p.runningFlagPath, '4567', 'utf-8');
    writeFileSync(p.pidFilePath, String(process.pid), 'utf-8');

    const state = getServerRuntimeState(p);

    expect(state).toEqual({ running: true, port: 4567, pid: process.pid });
  });

  it('falls back to the default port for invalid marker content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-liveness-port-'));
    const p = paths(dir);
    writeFileSync(p.runningFlagPath, 'not-a-port', 'utf-8');

    expect(getServerPort(p)).toBe(DEFAULT_PORT);
  });
});
