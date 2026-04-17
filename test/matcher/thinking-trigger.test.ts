import { describe, it, expect } from 'vitest';
import { detectThinkingNeed } from '../../src/matcher/thinking-trigger.js';

describe('detectThinkingNeed', () => {
  describe('Rule 1: Long input + no code reference → deep-interview', () => {
    it('triggers deep-interview for long vague Chinese query', () => {
      const hint = detectThinkingNeed('我想做一个帮助新手学习编程的产品，你觉得应该怎么设计功能最吸引人，需要考虑哪些方面');
      expect(hint.triggered).toBe(true);
      expect(hint.suggestedSkills.some(s => s.name === 'deep-interview')).toBe(true);
    });

    it('does NOT trigger for long query with .ts extension', () => {
      const hint = detectThinkingNeed('我想做一个小工具帮我处理 src/utils/helper.ts 里的业务逻辑，怎么设计最好最吸引人');
      expect(hint.triggered).toBe(false);
    });

    it('does NOT trigger for long query with function pattern', () => {
      const hint = detectThinkingNeed('someFunc() 是我的核心函数，怎么改进它的性能和可维护性');
      expect(hint.triggered).toBe(false);
    });

    it('does NOT trigger for long query with ClassName pattern', () => {
      const hint = detectThinkingNeed('ClassName 的设计有问题，我想知道怎么改进它最合适');
      expect(hint.triggered).toBe(false);
    });

    it('triggers for query just over 80 CJK chars', () => {
      const hint = detectThinkingNeed('我想做一个帮助新手学习编程的产品功能和界面设计，你觉得最吸引人的地方是什么');
      expect(hint.triggered).toBe(true);
    });
  });

  describe('Rule 2: Choice question → ralplan', () => {
    it('triggers ralplan for A还是B pattern', () => {
      const hint = detectThinkingNeed('我应该用 Rust 还是 Go 写这个服务？');
      expect(hint.triggered).toBe(true);
      expect(hint.suggestedSkills.some(s => s.name === 'ralplan')).toBe(true);
    });

    it('triggers ralplan for 选哪个', () => {
      const hint = detectThinkingNeed('我该选哪个方案最合适');
      expect(hint.triggered).toBe(true);
    });

    it('triggers ralplan for or', () => {
      const hint = detectThinkingNeed('React or Vue 哪个更适合这个项目');
      expect(hint.triggered).toBe(true);
    });

    it('triggers ralplan for 是...还是', () => {
      const hint = detectThinkingNeed('是直接实现还是先调研一下');
      expect(hint.triggered).toBe(true);
    });
  });

  describe('Rule 3: Open-ended question → critic', () => {
    it('triggers critic for 怎么看', () => {
      const hint = detectThinkingNeed('你觉得这个架构怎么样');
      expect(hint.triggered).toBe(true);
      expect(hint.suggestedSkills.some(s => s.name === 'critic')).toBe(true);
    });

    it('triggers critic for 觉得 at start', () => {
      const hint = detectThinkingNeed('觉得这个方案可行吗');
      expect(hint.triggered).toBe(true);
    });

    it('triggers critic for 为什么', () => {
      const hint = detectThinkingNeed('为什么要选择微服务架构');
      expect(hint.triggered).toBe(true);
    });

    it('triggers critic for 如何评价', () => {
      const hint = detectThinkingNeed('如何评价这个新的设计方案');
      expect(hint.triggered).toBe(true);
    });

    it('triggers critic for trailing question marks', () => {
      const hint = detectThinkingNeed('这个想法???');
      expect(hint.triggered).toBe(true);
    });
  });

  describe('Rule 4: Intent without tech stack → deep-interview', () => {
    it('triggers deep-interview for 想做一个 without tech', () => {
      const hint = detectThinkingNeed('我想做一个产品帮助程序员提高效率');
      expect(hint.triggered).toBe(true);
      expect(hint.suggestedSkills.some(s => s.name === 'deep-interview')).toBe(true);
    });

    it('triggers for 打算实现', () => {
      const hint = detectThinkingNeed('我打算实现一个新的工作流');
      expect(hint.triggered).toBe(true);
    });

    it('triggers for 要构建', () => {
      const hint = detectThinkingNeed('要构建一个灵活的系统');
      expect(hint.triggered).toBe(true);
    });

    it('does NOT trigger for intent with tech stack reference', () => {
      const hint = detectThinkingNeed('我想做一个Python项目来处理这个问题');
      expect(hint.triggered).toBe(false);
    });
  });

  describe('Non-trigger cases', () => {
    it('does NOT trigger for specific code change', () => {
      const hint = detectThinkingNeed('修改 src/auth.ts 第 42 行的 null check');
      expect(hint.triggered).toBe(false);
    });

    it('does NOT trigger for short simple query', () => {
      const hint = detectThinkingNeed('build 失败了');
      expect(hint.triggered).toBe(false);
    });

    it('does NOT trigger for empty string', () => {
      const hint = detectThinkingNeed('');
      expect(hint.triggered).toBe(false);
    });

    it('does NOT trigger for specific implementation question', () => {
      const hint = detectThinkingNeed('如何在 React 中实现 useCallback 的优化');
      expect(hint.triggered).toBe(false);
    });
  });

  describe('Output format', () => {
    it('includes reason when triggered', () => {
      const hint = detectThinkingNeed('我应该用 Rust 还是 Go 写这个服务？');
      expect(hint.reason).toBeTruthy();
    });

    it('includes why for each suggested skill', () => {
      const hint = detectThinkingNeed('我应该用 Rust 还是 Go 写这个服务？');
      expect(hint.suggestedSkills.length).toBeGreaterThan(0);
      for (const s of hint.suggestedSkills) {
        expect(s.why).toBeTruthy();
      }
    });

    it('returns at most 2 skills', () => {
      const hint = detectThinkingNeed('我想做一个帮助新手学习编程的产品，你觉得应该怎么设计功能最吸引人，需要考虑哪些方面');
      expect(hint.suggestedSkills.length).toBeLessThanOrEqual(2);
    });

    it('returns empty skills array when not triggered', () => {
      const hint = detectThinkingNeed('build 失败了');
      expect(hint.suggestedSkills).toEqual([]);
    });
  });
});
