import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPackageVersion } from '../src/version.js';

describe('version source', () => {
  it('uses package.json as the source of truth', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')) as { version: string };
    expect(getPackageVersion()).toBe(pkg.version);
  });

  it('CLI --version matches package.json after build', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')) as { version: string };
    const output = execFileSync(process.execPath, [resolve(process.cwd(), 'dist/bin/lazybrain.js'), '--version'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    }).trim();
    expect(output).toBe(`lazybrain ${pkg.version}`);
  });

  it('CLI --version ignores a caller project package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')) as { version: string };
    const tempDir = mkdtempSync(join(tmpdir(), 'lazybrain-version-cwd-'));
    try {
      writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'caller-app', version: '9.9.9' }), 'utf-8');
      const output = execFileSync(process.execPath, [resolve(process.cwd(), 'dist/bin/lazybrain.js'), '--version'], {
        cwd: tempDir,
        encoding: 'utf-8',
      }).trim();
      expect(output).toBe(`lazybrain ${pkg.version}`);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
