import { describe, expect, it } from 'vitest';
import { detectGoal, enrichWithGoal, getGoalTools, goalNeedsPlanning } from '../../src/governance/user-goals.js';

describe('detectGoal', () => {
  it('detects polish for 优化', () => {
    const r = detectGoal('帮我优化一下这段代码');
    expect(r?.goal).toBe('polish');
    expect(r?.label).toBe('润色整理');
  });

  it('detects polish for refine', () => {
    const r = detectGoal('polish this function');
    expect(r?.goal).toBe('polish');
  });

  it('detects explore for 调研', () => {
    const r = detectGoal('调研一下市面上的 MCP 方案');
    expect(r?.goal).toBe('explore');
    expect(r?.label).toBe('探索调研');
    expect(r?.needsPlanning).toBe(false);
  });

  it('detects explore for research', () => {
    const r = detectGoal('research the best approach');
    expect(r?.goal).toBe('explore');
  });

  it('detects systematize for 架构', () => {
    const r = detectGoal('设计一个微服务架构');
    expect(r?.goal).toBe('systematize');
    expect(r?.label).toBe('系统化');
    expect(r?.needsPlanning).toBe(true);
  });

  it('detects systematize for architecture', () => {
    const r = detectGoal('system architecture design');
    expect(r?.goal).toBe('systematize');
    expect(r?.needsPlanning).toBe(true);
  });

  it('returns null for non-matching query', () => {
    const r = detectGoal('帮我写一个 hello world');
    expect(r).toBeNull();
  });

  it('returns null for very short query', () => {
    const r = detectGoal('修一下');
    expect(r).toBeNull();
  });
});

describe('getGoalTools', () => {
  it('returns tools for polish', () => {
    expect(getGoalTools('polish')).toContain('simplify');
  });

  it('returns tools for explore', () => {
    expect(getGoalTools('explore')).toContain('explore');
  });

  it('returns tools for systematize', () => {
    expect(getGoalTools('systematize')).toContain('architect');
  });

  it('returns empty for unknown goal', () => {
    expect(getGoalTools('unknown' as 'polish')).toEqual([]);
  });
});

describe('goalNeedsPlanning', () => {
  it('polish does not need planning', () => {
    expect(goalNeedsPlanning('polish')).toBe(false);
  });

  it('explore does not need planning', () => {
    expect(goalNeedsPlanning('explore')).toBe(false);
  });

  it('systematize needs planning', () => {
    expect(goalNeedsPlanning('systematize')).toBe(true);
  });
});

describe('enrichWithGoal', () => {
  it('adds warning when goal detected', () => {
    const rec = { matches: [], comparisons: [], compositions: [], upgrades: [], external: [] };
    const enriched = enrichWithGoal('帮我优化代码', rec);
    expect(enriched.warnings?.some(w => w.includes('Goal-First'))).toBe(true);
  });

  it('returns unchanged recommendation when no goal', () => {
    const rec = { matches: [], comparisons: [], compositions: [], upgrades: [], external: [], warnings: ['existing'] };
    const enriched = enrichWithGoal('写一个函数', rec);
    expect(enriched.warnings).toEqual(['existing']);
  });
});
