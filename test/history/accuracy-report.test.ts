import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeTool, formatWeeklyReport } from '../../src/history/accuracy-report.js';
import type { WeeklyStats } from '../../src/history/accuracy-report.js';
import { extractUsedTools, parseTranscript } from '../../src/history/tool-usage-tracker.js';

describe('normalizeTool', () => {
  it('lowercases agent: subagent format', () => {
    expect(normalizeTool('agent:Executor')).toBe('agent:executor');
  });

  it('lowercases skill: name format', () => {
    expect(normalizeTool('skill:Deep-Interview')).toBe('skill:deep-interview');
  });

  it('lowercases plain tool names', () => {
    expect(normalizeTool('Bash')).toBe('bash');
    expect(normalizeTool('Read')).toBe('read');
  });

  it('handles already lowercase strings', () => {
    expect(normalizeTool('agent:executor')).toBe('agent:executor');
  });
});

describe('formatWeeklyReport', () => {
  it('formats empty stats', () => {
    const stats: WeeklyStats = {
      totalSessions: 0,
      totalRecommendations: 0,
      totalMatches: 0,
      totalMissed: 0,
      totalUnexpected: 0,
      accuracyRate: 0,
      topMissed: [],
      topUnexpected: [],
    };
    const output = formatWeeklyReport(stats);
    expect(output).toContain('LazyBrain 推荐准确率报告');
    expect(output).toContain('总 session：0');
    expect(output).toContain('（暂无数据）');
  });

  it('formats stats with data', () => {
    const stats: WeeklyStats = {
      totalSessions: 3,
      totalRecommendations: 10,
      totalMatches: 6,
      totalMissed: 4,
      totalUnexpected: 2,
      accuracyRate: 0.6,
      topMissed: [
        { tool: 'agent:code-reviewer', recommended: 5, adopted: 2, rate: 0.4 },
        { tool: 'skill:deep-interview', recommended: 3, adopted: 1, rate: 0.333 },
      ],
      topUnexpected: [
        { tool: 'Bash', count: 3 },
        { tool: 'skill:git-master', count: 2 },
      ],
    };
    const output = formatWeeklyReport(stats);
    expect(output).toContain('总 session：3');
    expect(output).toContain('总推荐次数：10');
    expect(output).toContain('推荐被采纳：6（60%）');
    expect(output).toContain('推荐被忽略：4');
    expect(output).toContain('未被推荐但用了：2 次');
    expect(output).toContain('最常被忽略的推荐');
    expect(output).toContain('agent:code-reviewer — 推荐 5 次，采纳 2 次（40%）');
    expect(output).toContain('系统盲点');
    expect(output).toContain('Bash — 用户调 3 次');
    expect(output).toContain('把这些盲点加入 exampleQueries');
  });

  it('omits suggestion line when no unexpected tools', () => {
    const stats: WeeklyStats = {
      totalSessions: 1,
      totalRecommendations: 2,
      totalMatches: 1,
      totalMissed: 1,
      totalUnexpected: 0,
      accuracyRate: 0.5,
      topMissed: [{ tool: 'skill:test', recommended: 1, adopted: 0, rate: 0 }],
      topUnexpected: [],
    };
    const output = formatWeeklyReport(stats);
    expect(output).not.toContain('把这些盲点加入 exampleQueries');
  });
});

describe('parseTranscript', () => {
  it('extracts Claude message.content tool_use events', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-transcript-'));
    const file = join(dir, 'transcript.jsonl');
    try {
      writeFileSync(file, JSON.stringify({
        type: 'assistant',
        timestamp: '2026-04-25T00:00:00.000Z',
        message: {
          content: [
            { type: 'text', text: 'checking' },
            { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
            { type: 'tool_use', name: 'Task', subagent_type: 'executor' },
          ],
        },
      }) + '\n', 'utf-8');

      const events = parseTranscript(file, 'session-1');
      expect(extractUsedTools(events)).toEqual(['Bash', 'agent:executor']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('extracts top-level tool_use events', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-transcript-'));
    const file = join(dir, 'transcript.jsonl');
    try {
      writeFileSync(file, [
        JSON.stringify({
          type: 'tool_use',
          timestamp: '2026-04-25T00:00:00.000Z',
          tool_name: 'skill',
          input: { skill: 'deep-dive' },
        }),
        JSON.stringify({
          type: 'tool_use',
          timestamp: '2026-04-25T00:00:01.000Z',
          tool_name: 'Task',
          input: { subagent_type: 'explorer' },
        }),
      ].join('\n') + '\n', 'utf-8');

      const events = parseTranscript(file, 'session-1');
      expect(extractUsedTools(events)).toEqual(['skill:deep-dive', 'agent:explorer']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
