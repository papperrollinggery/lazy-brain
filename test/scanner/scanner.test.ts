import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { scan } from '../../src/scanner/scanner.js';

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
