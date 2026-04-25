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
      secretaryApiBase: 'https://example.test/v1',
      secretaryModel: 'public-model-name',
      compileApiKey: 'real-compile-key',
      embeddingApiKey: 'real-embedding-key',
      secretaryApiKey: 'real-secretary-key',
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
    expect(output).not.toContain('real-compile-key');
    expect(output).not.toContain('real-embedding-key');
    expect(output).not.toContain('real-secretary-key');
    expect(output).toContain('https://example.test/v1');
    expect(output).toContain('public-model-name');
  });
});
