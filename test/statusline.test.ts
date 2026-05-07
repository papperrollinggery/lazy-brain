import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('statusline route activity', () => {
  it('shows recent CLI route events instead of staying idle', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'lazybrain-statusline-'));
    const routeEventsPath = join(tempDir, 'route-events.jsonl');

    try {
      writeFileSync(routeEventsPath, JSON.stringify({
        eventId: 'event-1',
        timestamp: new Date().toISOString(),
        source: 'cli',
        queryHash: 'hash',
        mode: 'route_plan',
        intent: 'Test repair and PR handoff',
        combo: 'test_pr_repair',
        recommendedChoice: {
          id: 'workflow:test_pr_repair',
          kind: 'workflow',
          label: 'test_pr_repair',
          confidence: 0.86,
        },
        skillIds: [],
        warningKinds: [],
        semanticWarning: false,
      }) + '\n', 'utf-8');

      const output = execFileSync(process.execPath, [resolve(process.cwd(), 'dist/bin/statusline.js')], {
        cwd: process.cwd(),
        encoding: 'utf-8',
        env: {
          ...process.env,
          HOME: tempDir,
          LAZYBRAIN_ROUTE_EVENTS_PATH: routeEventsPath,
        },
      });

      expect(output).toContain('cli test_pr_repair [86%]');
      expect(output).not.toContain('待机中');
      expect(output).not.toContain('图谱');
      expect(output).not.toContain('GNX');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('shows the last stale route instead of falling back to idle', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'lazybrain-statusline-'));
    const routeEventsPath = join(tempDir, 'route-events.jsonl');

    try {
      writeFileSync(routeEventsPath, JSON.stringify({
        eventId: 'event-old',
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        source: 'cli',
        queryHash: 'hash',
        mode: 'route_plan',
        combo: 'route_dogfood',
        recommendedChoice: {
          id: 'workflow:route_dogfood',
          kind: 'workflow',
          label: 'route_dogfood',
          confidence: 0.86,
        },
        skillIds: [],
        warningKinds: [],
        semanticWarning: false,
      }) + '\n', 'utf-8');

      const output = execFileSync(process.execPath, [resolve(process.cwd(), 'dist/bin/statusline.js')], {
        cwd: process.cwd(),
        encoding: 'utf-8',
        env: {
          ...process.env,
          HOME: tempDir,
          LAZYBRAIN_ROUTE_EVENTS_PATH: routeEventsPath,
        },
      });

      expect(output).toContain('上次');
      expect(output).toContain('cli route_dogfood [86%]');
      expect(output).not.toContain('待机中');
      expect(output).not.toContain('图谱');
      expect(output).not.toContain('GNX');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('does not fall back to global upstream HUD when explicit project chain is missing', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'lazybrain-statusline-chain-'));
    const missingProjectChain = join(tempDir, 'project', 'missing-chain.json');
    const globalChain = join(tempDir, '.claude', 'lazybrain-statusline-chain.json');

    try {
      mkdirSync(join(tempDir, '.claude'), { recursive: true });
      writeFileSync(globalChain, JSON.stringify({ upstreamCommand: 'printf GLOBAL_HUD' }), 'utf-8');

      const output = execFileSync(process.execPath, [resolve(process.cwd(), 'dist/bin/statusline-combined.js')], {
        cwd: process.cwd(),
        encoding: 'utf-8',
        env: {
          ...process.env,
          HOME: tempDir,
          LAZYBRAIN_STATUSLINE_CHAIN: missingProjectChain,
        },
      });

      expect(output).not.toContain('GLOBAL_HUD');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
