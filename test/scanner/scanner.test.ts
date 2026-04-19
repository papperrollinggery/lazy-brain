import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { scan } from '../../src/scanner/scanner.js';

const fixturesDir = resolve(__dirname, '../fixtures');

describe('scanner', () => {
  it('scans skills from extra paths', () => {
    const result = scan({
      extraPaths: [resolve(fixturesDir, 'skills')],
    });

    expect(result.scannedFiles).toBeGreaterThanOrEqual(2);
    const fixtureSkills = result.capabilities.filter(c =>
      c.filePath.includes('/fixtures/skills/')
    );
    expect(fixtureSkills.length).toBeGreaterThanOrEqual(2);
  });

  it('scans agents from extra paths', () => {
    const result = scan({
      extraPaths: [resolve(fixturesDir, 'agents')],
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
    });

    const pluginAgent = result.capabilities.find(c => c.name === 'Test Plugin Agent');
    expect(pluginAgent?.kind).toBe('agent');
    expect(pluginAgent?.filePath).toContain('/fixtures/plugins/sample-plugin/agents/');

    const pluginCommand = result.capabilities.find(c => c.name === 'test-plugin-command');
    expect(pluginCommand?.kind).toBe('command');
    expect(pluginCommand?.filePath).toContain('/fixtures/plugins/sample-plugin/commands/');
  });

  it('handles non-existent paths gracefully', () => {
    const result = scan({
      extraPaths: [resolve(fixturesDir, 'non-existent-path')],
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
    });

    expect(result.scannedFiles).toBeGreaterThan(0);
    expect(result.scannedPaths).toBeGreaterThan(0);
  });

  it('invokes progress callback', () => {
    const progressCalls: Array<[number, number]> = [];

    scan({
      extraPaths: [resolve(fixturesDir, 'skills')],
      onProgress: (scanned, found) => {
        progressCalls.push([scanned, found]);
      },
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[progressCalls.length - 1][0]).toBeGreaterThan(0);
  });
});
