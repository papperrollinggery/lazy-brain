import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('config output redaction', () => {
  let tempDir: string;
  const cliPath = resolve(process.cwd(), 'dist/bin/lazybrain.js');

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'lazybrain-config-redaction-'));
    const configPath = join(tempDir, '.lazybrain', 'config.json');
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      providerApiBase: 'https://example.test/v1',
      providerModel: 'public-model-name',
      providerApiKey: 'real-provider-key',
      registryToken: 'real-registry-token',
      serviceSecret: 'real-service-secret',
    }), 'utf-8');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('redacts API keys from config show', () => {
    const output = execFileSync(process.execPath, [cliPath, 'config', 'show'], {
      cwd: tempDir,
      env: { ...process.env, HOME: tempDir },
      encoding: 'utf-8',
    });

    expect(output).toContain('<redacted>');
    expect(output).not.toContain('real-provider-key');
    expect(output).not.toContain('real-registry-token');
    expect(output).not.toContain('real-service-secret');
    expect(output).toContain('https://example.test/v1');
    expect(output).toContain('public-model-name');
  });
});
