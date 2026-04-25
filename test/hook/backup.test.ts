import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHookBackup, findHookBackup, restoreHookBackup } from '../../src/hook/backup.js';

describe('hook backup', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'lazybrain-hook-backup-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates backup and restores previous settings', () => {
    const settingsPath = join(tempDir, '.claude', 'settings.json');
    const chainPath = join(tempDir, '.claude', 'lazybrain-statusline-chain.json');
    const mapPath = join(tempDir, '.lazybrain', 'hook-install-map.json');
    const legacyPath = join(tempDir, '.lazybrain', 'hook-install.json');
    mkdirSync(join(tempDir, '.claude'), { recursive: true });
    writeFileSync(settingsPath, '{"before":true}', { encoding: 'utf-8', flag: 'w' });

    const backup = createHookBackup({
      scope: 'project',
      settingsPath,
      statuslineChainPath: chainPath,
      installStateMapPath: mapPath,
      legacyInstallStatePath: legacyPath,
      now: new Date('2026-04-25T00:00:00.000Z'),
    });

    writeFileSync(settingsPath, '{"after":true}', 'utf-8');
    restoreHookBackup(settingsPath, backup);

    expect(readFileSync(settingsPath, 'utf-8')).toBe('{"before":true}');
    expect(findHookBackup(settingsPath, backup.id)?.id).toBe(backup.id);
  });

  it('removes files that did not exist at backup time', () => {
    const settingsPath = join(tempDir, '.claude', 'settings.json');
    const chainPath = join(tempDir, '.claude', 'lazybrain-statusline-chain.json');
    const mapPath = join(tempDir, '.lazybrain', 'hook-install-map.json');
    const legacyPath = join(tempDir, '.lazybrain', 'hook-install.json');

    const backup = createHookBackup({
      scope: 'project',
      settingsPath,
      statuslineChainPath: chainPath,
      installStateMapPath: mapPath,
      legacyInstallStatePath: legacyPath,
      now: new Date('2026-04-25T00:00:00.000Z'),
    });

    writeFileSync(settingsPath, '{"after":true}', 'utf-8');
    restoreHookBackup(settingsPath, backup);

    expect(existsSync(settingsPath)).toBe(false);
  });

  it('finds a specific backup by timestamp id', () => {
    const settingsPath = join(tempDir, '.claude', 'settings.json');
    const chainPath = join(tempDir, '.claude', 'lazybrain-statusline-chain.json');
    const mapPath = join(tempDir, '.lazybrain', 'hook-install-map.json');
    const legacyPath = join(tempDir, '.lazybrain', 'hook-install.json');

    const first = createHookBackup({
      scope: 'project',
      settingsPath,
      statuslineChainPath: chainPath,
      installStateMapPath: mapPath,
      legacyInstallStatePath: legacyPath,
      now: new Date('2026-04-25T00:00:00.000Z'),
    });
    const second = createHookBackup({
      scope: 'project',
      settingsPath,
      statuslineChainPath: chainPath,
      installStateMapPath: mapPath,
      legacyInstallStatePath: legacyPath,
      now: new Date('2026-04-25T01:00:00.000Z'),
    });

    expect(findHookBackup(settingsPath, first.id)?.id).toBe(first.id);
    expect(findHookBackup(settingsPath)?.id).toBe(second.id);
  });
});
