import { describe, it, expect } from 'vitest';
import { detectDecisionType, buildRecommendation } from '../../src/matcher/decision-type.js';

describe('decision-type detector', () => {
  describe('analysis', () => {
    it('detects 中文 analysis queries', () => {
      expect(detectDecisionType('帮我分析一下这个架构设计')).toBe('analysis');
      expect(detectDecisionType('评估一下这段代码')).toBe('analysis');
    });

    it('detects English analysis queries', () => {
      expect(detectDecisionType('code review this PR')).toBe('analysis');
      expect(detectDecisionType('analyze the performance')).toBe('analysis');
    });

    it('does not match simple implementation tasks', () => {
      expect(detectDecisionType('修改第 42 行代码')).not.toBe('analysis');
    });
  });

  describe('complex_impl', () => {
    it('detects complex refactoring with long query (>=60 chars)', () => {
      const long = '重构整个 auth 模块，包括 login、session、token 三个子系统，需要修改多个文件并确保向后兼容，这是个大工程';
      expect(detectDecisionType(long)).toBe('complex_impl');
    });

    it('short refactoring query returns null', () => {
      expect(detectDecisionType('重构这个模块')).toBeNull();
    });
  });

  describe('ambiguous', () => {
    it('detects vague queries without specific files', () => {
      expect(detectDecisionType('这个功能怎么办好')).toBe('ambiguous');
      expect(detectDecisionType('帮我想想怎么设计这个')).toBe('ambiguous');
    });

    it('does not match if has specific file path', () => {
      expect(detectDecisionType('修改 src/auth.ts')).toBeNull();
      expect(detectDecisionType('帮我看看 utils.ts 怎么办')).toBeNull();
    });
  });

  describe('research', () => {
    it('detects research queries', () => {
      expect(detectDecisionType('调研一下市面上的 MCP server 方案')).toBe('research');
      expect(detectDecisionType('research on best practices')).toBe('research');
    });

    it('does not match simple questions', () => {
      expect(detectDecisionType('什么是 TypeScript')).toBeNull();
    });
  });

  describe('team_task', () => {
    it('detects /team command', () => {
      expect(detectDecisionType('/team 做这个任务')).toBe('team_task');
    });

    it('does not match /team with analysis keyword', () => {
      expect(detectDecisionType('team mode 分析这个')).not.toBe('team_task');
    });
  });

  describe('null cases', () => {
    it('returns null for specific file operations', () => {
      expect(detectDecisionType('修改 src/auth.ts 第 42 行')).toBeNull();
      expect(detectDecisionType('add import to utils.ts')).toBeNull();
    });

    it('returns null for "什么是" type questions', () => {
      expect(detectDecisionType('什么是 TypeScript')).toBeNull();
    });
  });

  describe('buildRecommendation', () => {
    it('returns recommendation for valid type', () => {
      const rec = buildRecommendation('analysis');
      expect(rec).not.toBeNull();
      expect(rec!.type).toBe('analysis');
      expect(rec!.suggestedTools).toContain('critic');
    });

    it('returns null for null type', () => {
      expect(buildRecommendation(null)).toBeNull();
    });
  });
});
