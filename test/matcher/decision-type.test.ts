import { describe, it, expect } from 'vitest';
import { detectDecisionType, buildDecisionRecommendation } from '../../src/matcher/decision-type.js';

describe('detectDecisionType', () => {
  it('detects analysis for 分析', () => {
    expect(detectDecisionType('帮我分析一下这个架构设计')).toBe('analysis');
  });
  it('detects analysis for English review', () => {
    expect(detectDecisionType('review this PR')).toBe('analysis');
  });

  it('detects complex_impl for long refactor query', () => {
    expect(detectDecisionType('重构整个 auth 模块，包括 login、session、token 三个子系统，要兼顾迁移方案，这需要重构多个文件和模块')).toBe('complex_impl');
  });
  it('does NOT detect complex_impl for short refactor query', () => {
    expect(detectDecisionType('重构这段')).not.toBe('complex_impl');
  });

  it('detects ambiguous for 怎么办', () => {
    expect(detectDecisionType('这个功能怎么办好')).toBe('ambiguous');
  });
  it('detects ambiguous for 想想', () => {
    expect(detectDecisionType('帮我想想怎么设计这个')).toBe('ambiguous');
  });
  it('does NOT detect ambiguous when specific file referenced', () => {
    expect(detectDecisionType('修改 src/auth.ts 里的 design 逻辑')).not.toBe('ambiguous');
  });

  it('detects research for 调研', () => {
    expect(detectDecisionType('调研一下市面上的 MCP server 方案')).toBe('research');
  });

  it('detects team_task for /team', () => {
    expect(detectDecisionType('/team 做这个任务')).toBe('team_task');
  });
  it('detects team_task for 组队', () => {
    expect(detectDecisionType('我想用多 agent 组队搞定这个')).toBe('team_task');
  });

  it('returns null for specific code change', () => {
    expect(detectDecisionType('修改 src/auth.ts 第 42 行的 null check')).toBeNull();
  });
  it('returns null for simple what-is question', () => {
    expect(detectDecisionType('什么是 TypeScript')).toBeNull();
  });
  it('returns null for build failure', () => {
    expect(detectDecisionType('build 失败了')).toBeNull();
  });
});

describe('buildDecisionRecommendation', () => {
  it('returns null for null type', () => {
    expect(buildDecisionRecommendation(null)).toBeNull();
  });
  it('returns complete recommendation for analysis', () => {
    const r = buildDecisionRecommendation('analysis');
    expect(r).not.toBeNull();
    expect(r?.suggestedTools).toContain('critic');
    expect(r?.reason).toBeTruthy();
    expect(r?.note).toBeTruthy();
  });
});
