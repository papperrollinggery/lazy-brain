import { describe, it, expect } from 'vitest';
import { formatDashboard } from '../../src/stats/session-dashboard.js';
import type { SessionStats } from '../../src/stats/session-stats.js';

describe('formatDashboard', () => {
  it('renders dashboard header with date', () => {
    const stats: SessionStats = {
      totalCapabilities: 100,
      totalMatches: 50,
      hitRate: 75,
      totalSavedTokens: 10000,
      totalSavedCostUSD: 0.5,
      recentMatches: [],
      newCapsThisWeek: 0,
      duplicatePairs: 0,
    };
    const output = formatDashboard(stats);
    expect(output).toContain('## 🧠 LazyBrain 武器库管家');
    expect(output).toContain('### 📊 你的工具使用');
  });

  it('renders stats table with correct values', () => {
    const stats: SessionStats = {
      totalCapabilities: 491,
      totalMatches: 540,
      hitRate: 78,
      totalSavedTokens: 45000,
      totalSavedCostUSD: 1.2,
      recentMatches: [],
      newCapsThisWeek: 0,
      duplicatePairs: 0,
    };
    const output = formatDashboard(stats);
    expect(output).toContain('| 491    | 540 次 | 78%');
    expect(output).toContain('~45k');
  });

  it('renders recent matches when empty', () => {
    const stats: SessionStats = {
      totalCapabilities: 10,
      totalMatches: 0,
      hitRate: 0,
      totalSavedTokens: 0,
      totalSavedCostUSD: 0,
      recentMatches: [],
      newCapsThisWeek: 0,
      duplicatePairs: 0,
    };
    const output = formatDashboard(stats);
    expect(output).toContain('### 🎯 最近推荐（Top 3）');
    expect(output).toContain('| — | — | — | ❓ |');
  });

  it('renders recent matches with data', () => {
    const stats: SessionStats = {
      totalCapabilities: 10,
      totalMatches: 5,
      hitRate: 80,
      totalSavedTokens: 5000,
      totalSavedCostUSD: 0.25,
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
      totalSavedTokens: 1000,
      totalSavedCostUSD: 0.1,
      recentMatches: [],
      newCapsThisWeek: 5,
      duplicatePairs: 2,
    };
    const output = formatDashboard(stats);
    expect(output).toContain('新增 5 个工具');
    expect(output).toContain('检测到 2 对重复工具');
  });

  it('renders command hints', () => {
    const stats: SessionStats = {
      totalCapabilities: 100,
      totalMatches: 10,
      hitRate: 50,
      totalSavedTokens: 1000,
      totalSavedCostUSD: 0.1,
      recentMatches: [],
      newCapsThisWeek: 0,
      duplicatePairs: 0,
    };
    const output = formatDashboard(stats);
    expect(output).toContain('lazybrain stats');
    expect(output).toContain('lazybrain wiki <name>');
    expect(output).toContain('推荐 xxx');
  });
});
