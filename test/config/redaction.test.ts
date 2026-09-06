import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('retired provider configuration', () => {
  it('does not expose legacy provider settings, even nested values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-config-'));
    try {
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        nested: { providerApiKey: 'real-provider-key' }, arbitrary: 'real-service-secret',
      }));
      const output = execFileSync(process.execPath, [resolve('dist/bin/lazybrain.js'), 'config', 'show'], {
        cwd: dir, env: { ...process.env, LAZYBRAIN_DATA_DIR: dir }, encoding: 'utf8',
      });
      expect(output).not.toContain('real-provider-key');
      expect(output).not.toContain('real-service-secret');
      expect(JSON.parse(output)).toMatchObject({ dataDirectory: dir, modelOverride: false });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
