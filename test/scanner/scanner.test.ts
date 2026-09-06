import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { scan } from '../../src/scanner/scanner.js';
import { dedup } from '../../src/scanner/dedup.js';
import { getDefaultScanPaths } from '../../src/constants.js';

const fixturesDir = resolve(__dirname, '../fixtures');

describe('scanner', () => {
  it('scans skills from extra paths', () => {
    const result = scan({
      extraPaths: [resolve(fixturesDir, 'skills')],
      includeDefaults: false,
    });

    expect(result.scannedFiles).toBeGreaterThanOrEqual(2);
    const fixtureSkills = result.capabilities.filter(c =>
      c.filePath.includes('/fixtures/skills/')
    );
    expect(fixtureSkills.length).toBeGreaterThanOrEqual(2);
  });

  it('scans top-level skillshub-style skill roots', () => {
    const result = scan({
      extraPaths: [resolve(fixturesDir, '.skillshub')],
      includeDefaults: false,
    });

    const skill = result.capabilities.find(c => c.name === 'test-ecc-skill');
    expect(skill?.kind).toBe('skill');
    expect(skill?.origin).toBe('ECC');
  });

  it('scans agents from extra paths', () => {
    const result = scan({
      extraPaths: [resolve(fixturesDir, 'agents')],
      includeDefaults: false,
    });

    const fixtureAgents = result.capabilities.filter(c =>
      c.filePath.includes('/fixtures/agents/')
    );
    expect(fixtureAgents.length).toBeGreaterThanOrEqual(1);
    const agent = fixtureAgents.find(c => c.name === 'Test Agent');
    expect(agent).toBeDefined();
  });

  it('scans commands from extra paths', () => {
    const result = scan({
      extraPaths: [resolve(fixturesDir, 'commands')],
      includeDefaults: false,
    });

    const fixtureCommands = result.capabilities.filter(c =>
      c.filePath.includes('/fixtures/commands/')
    );
    expect(fixtureCommands.length).toBe(2);
    const cmd = fixtureCommands.find(c => c.name === 'test-command');
    expect(cmd?.description).toBe('A test command for scanner unit tests');
  });

  it('scans plugin-provided agents and commands', () => {
    const result = scan({
      extraPaths: [resolve(fixturesDir, 'plugins')],
      includeDefaults: false,
    });

    const pluginAgent = result.capabilities.find(c => c.name === 'Test Plugin Agent');
    expect(pluginAgent?.kind).toBe('agent');
    expect(pluginAgent?.origin).toBe('plugin:sample-plugin@1.2.3');
    expect(pluginAgent?.filePath).toContain('/fixtures/plugins/sample-plugin/agents/');

    const pluginCommand = result.capabilities.find(c => c.name === 'test-plugin-command');
    expect(pluginCommand?.kind).toBe('command');
    expect(pluginCommand?.origin).toBe('plugin:sample-plugin@1.2.3');
    expect(pluginCommand?.filePath).toContain('/fixtures/plugins/sample-plugin/commands/');

    const plugin = result.capabilities.find(c => c.name === 'sample-plugin' && c.kind === 'plugin');
    expect(plugin?.meta?.version).toBe('1.2.3');

    const mcp = result.capabilities.find(c => c.name === 'sample-docs' && c.kind === 'mcp');
    expect(mcp?.description).toContain('stdio');
  });

  it('indexes MCP names without copying credentials', () => {
    const result = scan({
      extraPaths: [
        resolve(fixturesDir, 'mcp', '.mcp.json'),
        resolve(fixturesDir, 'mcp', 'config.toml'),
      ],
      includeDefaults: false,
    });

    expect(result.capabilities.map(c => c.name)).toEqual(expect.arrayContaining(['fixture-http', 'fixture_stdio']));
    expect(JSON.stringify(result.capabilities)).not.toContain('must-never-be-indexed');
  });

  it('records configured and disabled MCP evidence without calling it available', () => {
    const result = scan({ extraPaths: [resolve(fixturesDir, 'mcp-disabled', '.mcp.json')], includeDefaults: false });
    const disabled = result.capabilities.find((capability) => capability.name === 'disabled-server');
    expect(disabled).toMatchObject({ discovery: 'configured', disabled: true });
    expect(JSON.stringify(disabled)).not.toContain('secret-token');
  });

  it('reads Codex skill invocation policy and local agent metadata', () => {
    const result = scan({ extraPaths: [resolve(fixturesDir, 'metadata-skill'), resolve(fixturesDir, 'agents')], includeDefaults: false });
    expect(result.capabilities.find((capability) => capability.name === 'metadata-skill')).toMatchObject({
      discovery: 'local-file', invocationPolicy: 'implicit-allowed', triggers: ['图片生成', 'visual design'],
    });
    expect(result.capabilities.find((capability) => capability.name === 'codex-fixture-role')).toMatchObject({ kind: 'agent', compatibility: ['codex'] });
  });

  it('does not read skill assets after finding the skill metadata leaf', () => {
    const result = scan({ extraPaths: [resolve(fixturesDir, 'metadata-skill')], includeDefaults: false });
    expect(result.scannedFiles).toBe(1);
    expect(result.capabilities).toHaveLength(1);
  });

  it('treats a Skill root as a leaf, including when nested assets contain SKILL.md', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-skill-leaf-'));
    const skill = join(dir, 'actual');
    try {
      mkdirSync(join(skill, 'assets', 'nested'), { recursive: true });
      writeFileSync(join(skill, 'SKILL.md'), '---\nname: actual-skill\ndescription: Actual skill\n---\n');
      writeFileSync(join(skill, 'assets', 'nested', 'SKILL.md'), '---\nname: asset-example\ndescription: Fixture asset\n---\n');
      for (const root of [dir, skill]) {
        const result = scan({ extraPaths: [root], includeDefaults: false });
        expect(result.capabilities.map((item) => item.name)).toEqual(['actual-skill']);
        expect(result.scannedFiles).toBe(1);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not merge equal names across capability kinds or enabled state', () => {
    const capability = (kind: 'skill' | 'mcp', disabled = false) => ({
      kind, name: 'same-name', description: 'fixture', origin: 'fixture', filePath: `/tmp/${kind}-${disabled}`, compatibility: ['codex'] as const, disabled,
    });
    const result = dedup([capability('skill', true), capability('skill'), capability('mcp')]);
    expect(result).toHaveLength(3);
    expect(result.find((item) => item.kind === 'skill' && !item.disabled)).toBeDefined();
    expect(result.find((item) => item.kind === 'mcp')).toBeDefined();
  });

  it('preserves same-named files from separate scopes but collapses symlink aliases', () => {
    const scopeResult = dedup([
      { kind: 'skill', name: 'same', description: '', origin: 'local', filePath: '/project/.agents/skills/same/SKILL.md', compatibility: ['codex'] as const },
      { kind: 'skill', name: 'same', description: '', origin: 'local', filePath: '/user/.codex/skills/same/SKILL.md', compatibility: ['codex'] as const },
    ]);
    expect(scopeResult).toHaveLength(2);

    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-dedup-'));
    const target = join(dir, 'SKILL.md');
    const alias = join(dir, 'alias.md');
    try {
      writeFileSync(target, '# fixture');
      symlinkSync(target, alias);
      const aliases = dedup([
        { kind: 'skill', name: 'same', description: '', origin: 'local', filePath: target, compatibility: ['codex'] as const },
        { kind: 'skill', name: 'same', description: '', origin: 'local', filePath: alias, compatibility: ['codex'] as const },
      ]);
      expect(aliases).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps Codex-only defaults isolated from Claude paths', () => {
    const paths = getDefaultScanPaths({ codex: true }, fixturesDir);
    expect(paths.some((path) => path.includes('.claude'))).toBe(false);
    expect(paths.some((path) => path.includes('.codex'))).toBe(true);
  });

  it('derives Codex identity from CODEX_HOME without washing Claude-only paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-codex-home-'));
    const claudeDir = mkdtempSync(join(tmpdir(), 'lazybrain-claude-home-'));
    const original = process.env.CODEX_HOME;
    const codexSkill = join(dir, 'skills', 'codex-skill', 'SKILL.md');
    const claudeSkill = join(claudeDir, '.claude', 'skills', 'claude-skill', 'SKILL.md');
    try {
      process.env.CODEX_HOME = dir;
      mkdirSync(join(dir, 'skills', 'codex-skill'), { recursive: true });
      mkdirSync(join(claudeDir, '.claude', 'skills', 'claude-skill'), { recursive: true });
      writeFileSync(codexSkill, '---\nname: codex-skill\ndescription: Codex fixture\n---\n');
      writeFileSync(claudeSkill, '---\nname: claude-skill\ndescription: Claude fixture\n---\n');
      const result = scan({ extraPaths: [codexSkill, claudeSkill], includeDefaults: false, platform: 'codex' });
      expect(result.capabilities.find((item) => item.name === 'codex-skill')).toMatchObject({ platform: 'codex', compatibility: ['codex'], tier: 0 });
      expect(result.capabilities.find((item) => item.name === 'claude-skill')).toMatchObject({ platform: 'claude-code', compatibility: ['claude-code'], tier: 2 });
    } finally {
      if (original === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = original;
      rmSync(dir, { recursive: true, force: true });
      rmSync(claudeDir, { recursive: true, force: true });
    }
  });

  it('keeps every nested project scope through the first worktree git file only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-project-roots-'));
    const root = join(dir, 'worktree');
    const cwd = join(root, 'nested', 'deeper');
    try {
      mkdirSync(cwd, { recursive: true });
      mkdirSync(join(dir, '.agents', 'skills'), { recursive: true });
      mkdirSync(join(root, 'nested', '.agents', 'skills'), { recursive: true });
      mkdirSync(join(cwd, '.agents', 'skills'), { recursive: true });
      writeFileSync(join(root, '.git'), 'gitdir: /outside/repository');
      const paths = getDefaultScanPaths({ codex: true }, cwd);
      expect(paths).toContain(join(cwd, '.agents', 'skills'));
      expect(paths).toContain(join(root, 'nested', '.agents', 'skills'));
      expect(paths).toContain(join(root, '.agents', 'skills'));
      expect(paths).not.toContain(join(dir, '.agents', 'skills'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses only cwd for project discovery when no git root exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-no-git-'));
    const cwd = join(dir, 'child');
    try {
      mkdirSync(join(dir, '.agents', 'skills'), { recursive: true });
      mkdirSync(join(cwd, '.agents', 'skills'), { recursive: true });
      const paths = getDefaultScanPaths({ codex: true }, cwd);
      expect(paths).toContain(join(cwd, '.agents', 'skills'));
      expect(paths).not.toContain(join(dir, '.agents', 'skills'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps every named plugin from one marketplace file', () => {
    const result = scan({ extraPaths: [resolve(fixturesDir, 'plugins', 'multi', 'marketplace.json')], includeDefaults: false });
    expect(result.capabilities.map((item) => item.name)).toEqual(expect.arrayContaining(['catalog-one', 'catalog-two']));
  });

  it('handles non-existent paths gracefully', () => {
    const result = scan({
      extraPaths: [resolve(fixturesDir, 'non-existent-path')],
      includeDefaults: false,
    });

    expect(result.errors).toHaveLength(0);
  });

  it('returns scan statistics', () => {
    const result = scan({
      extraPaths: [
        resolve(fixturesDir, 'skills'),
        resolve(fixturesDir, 'agents'),
        resolve(fixturesDir, 'commands'),
      ],
      includeDefaults: false,
    });

    expect(result.scannedFiles).toBeGreaterThan(0);
    expect(result.scannedPaths).toBeGreaterThan(0);
  });

  it('invokes progress callback', () => {
    const progressCalls: Array<[number, number]> = [];

    scan({
      extraPaths: [resolve(fixturesDir, 'skills')],
      includeDefaults: false,
      onProgress: (scanned, found) => {
        progressCalls.push([scanned, found]);
      },
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[progressCalls.length - 1][0]).toBeGreaterThan(0);
  });
});
