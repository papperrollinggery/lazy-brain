import { describe, expect, it } from 'vitest';
import { buildHookPlan } from '../../src/hook/plan.js';

const base = {
  scope: 'project' as const,
  settingsPath: '/repo/.claude/settings.json',
  workspaceRoot: '/repo',
  hookCommand: 'node /repo/lazybrain/dist/bin/hook.js',
  statuslineScript: '/repo/lazybrain/dist/bin/statusline.js',
  combinedStatuslineScript: '/repo/lazybrain/dist/bin/statusline-combined.js',
  combinedStatuslineCommand: 'node /repo/lazybrain/dist/bin/statusline-combined.js',
  installStatePath: '/home/.lazybrain/hook-install-map.json',
  shouldInstallStatusline: false,
  shouldReplaceStatusline: false,
  scriptsReady: true,
};

describe('buildHookPlan', () => {
  it('returns safe plan without settings', () => {
    const plan = buildHookPlan({ ...base, settings: {} });
    expect(plan.risk).toBe('safe');
    expect(plan.lazybrain.addUserPromptSubmit).toBe(true);
    expect(plan.statusline.mode).toBe('none');
  });

  it('preserves third-party UserPromptSubmit hooks', () => {
    const plan = buildHookPlan({
      ...base,
      settings: {
        hooks: {
          UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'python third-party.py' }] }],
        },
      },
    });
    expect(plan.thirdParty.commands).toEqual(['python third-party.py']);
    expect(plan.risk).toBe('safe');
  });

  it('marks legacy Stop registration as needs_attention', () => {
    const plan = buildHookPlan({
      ...base,
      settings: {
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: 'node /repo/lazybrain/dist/bin/hook.js' }] }],
        },
      },
    });
    expect(plan.risk).toBe('needs_attention');
    expect(plan.lazybrain.stop).toBe(true);
    expect(plan.lazybrain.removeEvents).toContain('Stop');
  });

  it('plans to combine inherited global HUD for project statusline install', () => {
    const plan = buildHookPlan({
      ...base,
      settings: {},
      globalSettings: {
        statusLine: { type: 'command', command: 'node ~/.claude/plugins/third-party-hud/index.js' },
      },
      shouldInstallStatusline: true,
    });
    expect(plan.statusline.mode).toBe('combine');
    expect(plan.statusline.inheritedCommand).toContain('third-party-hud');
  });

  it('plans to combine existing project HUD instead of replacing it', () => {
    const plan = buildHookPlan({
      ...base,
      settings: {
        statusLine: { type: 'command', command: 'node ~/.claude/plugins/third-party-hud/index.js' },
      },
      shouldInstallStatusline: true,
    });
    expect(plan.statusline.mode).toBe('combine');
    expect(plan.statusline.existingCommand).toContain('third-party-hud');
  });

  it('reports stable json fields', () => {
    const plan = buildHookPlan({ ...base, settings: {} });
    expect(Object.keys(plan).sort()).toEqual([
      'blockers',
      'installStatePath',
      'lazybrain',
      'lifecycle',
      'risk',
      'scope',
      'settingsPath',
      'statusline',
      'thirdParty',
      'warnings',
      'workspaceRoot',
    ].sort());
  });

  it('redacts secrets from hook and statusline commands', () => {
    const plan = buildHookPlan({
      ...base,
      settings: {
        hooks: {
          UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'node third-party.js --token=abc123' }] }],
        },
        statusLine: { type: 'command', command: 'echo hud api_key=secret sk-live123 Bearer abc' },
      },
    });
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toContain('abc123');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('sk-live123');
    expect(serialized).toContain('--token=[redacted]');
    expect(serialized).toContain('api_key=[redacted]');
    expect(serialized).toContain('Bearer [redacted]');
  });
});
