import { describe, it, expect } from 'vitest';
import { formatDashboard } from '../../src/stats/session-dashboard.js';
import type { SessionStats } from '../../src/stats/session-stats.js';

describe('formatDashboard', () => {
  it('renders dashboard header with date', () => {
    const stats: SessionStats = {
      totalCapabilities: 100,
      totalMatches: 50,
      hitRate: 75,
      baselineTokens: 12000,
      actualTokens: 10000,
      savedTokens: 2000,
      baselineCostUSD: 0.6,
      actualCostUSD: 0.5,
      savedCostUSD: 0.1,
      recentMatches: [],
      newCapsThisWeek: 0,
      duplicatePairs: 0,
    };
    const output = formatDashboard(stats);
    expect(output).toContain('## 🧠 LazyBrain');
    expect(output).toContain('今天我替你：');
  });

  it('renders stats table with correct values', () => {
    const stats: SessionStats = {
      totalCapabilities: 491,
      totalMatches: 540,
      hitRate: 78,
      baselineTokens: 50000,
      actualTokens: 45000,
      savedTokens: 5000,
      baselineCostUSD: 1.5,
      actualCostUSD: 1.2,
      savedCostUSD: 0.3,
      recentMatches: [],
      newCapsThisWeek: 0,
      duplicatePairs: 0,
    };
    const output = formatDashboard(stats);
    expect(output).toContain('自动路由 540 次');
    expect(output).toContain('接受 421');
    expect(output).toContain('~5k');
  });

  it('renders recent matches when empty', () => {
    const stats: SessionStats = {
      totalCapabilities: 10,
      totalMatches: 0,
      hitRate: 0,
      baselineTokens: 0,
      actualTokens: 0,
      savedTokens: 0,
      baselineCostUSD: 0,
      actualCostUSD: 0,
      savedCostUSD: 0,
      recentMatches: [],
      newCapsThisWeek: 0,
      duplicatePairs: 0,
    };
    const output = formatDashboard(stats);
    expect(output).toContain('最近我做过的决定：');
    expect(output).toContain('还没有可展示的推荐');
  });

  it('renders recent matches with data', () => {
    const stats: SessionStats = {
      totalCapabilities: 10,
      totalMatches: 5,
      hitRate: 80,
      baselineTokens: 6000,
      actualTokens: 5000,
      savedTokens: 1000,
      baselineCostUSD: 0.30,
      actualCostUSD: 0.25,
      savedCostUSD: 0.05,
      recentMatches: [
        { timestamp: '20:51', query: '方案 a', matched: 'Tool Evaluator', accepted: true },
        { timestamp: '12:05', query: '审查吧', matched: 'code-reviewer', accepted: true },
        { timestamp: '10:30', query: '修 bug', matched: 'debugger', accepted: false },
      ],
      newCapsThisWeek: 3,
      duplicatePairs: 4,
    };
    const output = formatDashboard(stats);
    expect(output).toContain('Tool Evaluator');
    expect(output).toContain('code-reviewer');
    expect(output).toContain('debugger');
    expect(output).toContain('✅');
    expect(output).toContain('❓');
  });

  it('renders new tools section', () => {
    const stats: SessionStats = {
      totalCapabilities: 100,
      totalMatches: 10,
      hitRate: 50,
      baselineTokens: 1200,
      actualTokens: 1000,
      savedTokens: 200,
      baselineCostUSD: 0.12,
      actualCostUSD: 0.1,
      savedCostUSD: 0.02,
      recentMatches: [],
      newCapsThisWeek: 5,
      duplicatePairs: 2,
    };
    const output = formatDashboard(stats);
    expect(output).toContain('新增 5 个工具');
    expect(output).toContain('发现 2 对可能重复的工具');
  });

  it('renders command hints', () => {
    const stats: SessionStats = {
      totalCapabilities: 100,
      totalMatches: 10,
      hitRate: 50,
      baselineTokens: 1200,
      actualTokens: 1000,
      savedTokens: 200,
      baselineCostUSD: 0.12,
      actualCostUSD: 0.1,
      savedCostUSD: 0.02,
      recentMatches: [],
      newCapsThisWeek: 0,
      duplicatePairs: 0,
    };
    const output = formatDashboard(stats);
    expect(output).toContain('lazybrain stats');
    expect(output).toContain('lazybrain wiki <name>');
    expect(output).toContain('lazybrain summary');
  });
});
