import { describe, it, expect } from 'vitest';
import { formatDashboard } from '../../src/stats/session-dashboard.js';
import type { SessionStats } from '../../src/stats/session-stats.js';

describe('formatDashboard', () => {
  it('renders dashboard header with date', () => {
    const stats: SessionStats = {
      totalCapabilities: 100,
      totalRecommendations: 50,
      acceptedRecommendations: 38,
      adoptionRate: 76,
      skippedRecommendations: 12,
      lastRecommendedTool: 'review-pr',
      recentMatches: [],
      topCapabilities: [],
      newCapsThisWeek: 0,
      duplicatePairs: 0,
    };
    const output = formatDashboard(stats);
    expect(output).toContain('## 🧠 LazyBrain');
    expect(output).toContain('启动摘要 / Startup recap');
    expect(output).toContain('不参与 Stop');
  });

  it('renders recap values with correct numbers', () => {
    const stats: SessionStats = {
      totalCapabilities: 491,
      totalRecommendations: 540,
      acceptedRecommendations: 421,
      adoptionRate: 78,
      skippedRecommendations: 119,
      lastRecommendedTool: 'review-pr',
      recentMatches: [],
      topCapabilities: ['review-pr', 'debugger'],
      newCapsThisWeek: 0,
      duplicatePairs: 0,
    };
    const output = formatDashboard(stats);
    expect(output).toContain('推荐记录：540 次');
    expect(output).toContain('接受 421');
    expect(output).toContain('采用率：78%');
    expect(output).toContain('/review-pr');
  });

  it('renders recent matches when empty', () => {
    const stats: SessionStats = {
      totalCapabilities: 10,
      totalRecommendations: 0,
      acceptedRecommendations: 0,
      adoptionRate: 0,
      skippedRecommendations: 0,
      lastRecommendedTool: null,
      recentMatches: [],
      topCapabilities: [],
      newCapsThisWeek: 0,
      duplicatePairs: 0,
    };
    const output = formatDashboard(stats);
    expect(output).toContain('最近决策 / Recent decisions');
    expect(output).toContain('No recent routing history');
  });

  it('renders recent matches with data', () => {
    const stats: SessionStats = {
      totalCapabilities: 10,
      totalRecommendations: 5,
      acceptedRecommendations: 4,
      adoptionRate: 80,
      skippedRecommendations: 1,
      lastRecommendedTool: 'Tool Evaluator',
      recentMatches: [
        { timestamp: '20:51', query: '方案 a', matched: 'Tool Evaluator', accepted: true },
        { timestamp: '12:05', query: '审查吧', matched: 'code-reviewer', accepted: true },
        { timestamp: '10:30', query: '修 bug', matched: 'debugger', accepted: false },
      ],
      topCapabilities: ['Tool Evaluator', 'code-reviewer', 'debugger'],
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
      totalRecommendations: 10,
      acceptedRecommendations: 5,
      adoptionRate: 50,
      skippedRecommendations: 5,
      lastRecommendedTool: 'debugger',
      recentMatches: [],
      topCapabilities: ['debugger'],
      newCapsThisWeek: 5,
      duplicatePairs: 2,
    };
    const output = formatDashboard(stats);
    expect(output).toContain('新增 5 个工具');
    expect(output).toContain('重复能力提示：2 对');
  });

  it('renders command hints', () => {
    const stats: SessionStats = {
      totalCapabilities: 100,
      totalRecommendations: 10,
      acceptedRecommendations: 5,
      adoptionRate: 50,
      skippedRecommendations: 5,
      lastRecommendedTool: 'debugger',
      recentMatches: [],
      topCapabilities: ['debugger'],
      newCapsThisWeek: 0,
      duplicatePairs: 0,
    };
    const output = formatDashboard(stats);
    expect(output).toContain('lazybrain stats');
    expect(output).toContain('lazybrain wiki');
    expect(output).toContain('lazybrain summary');
    expect(output).toContain('lazybrain hook status');
  });
});
