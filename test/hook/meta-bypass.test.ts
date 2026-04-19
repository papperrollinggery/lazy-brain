import { describe, expect, it } from 'vitest';
import { isMetaPrompt } from '../../src/utils/meta-prompt.js';

describe('Meta Prompt Bypass', () => {
  describe('should trigger bypass', () => {
    const bypassPrompts = [
      '不要继续写代码',
      '不要继续做 Fusion Registry',
      '只输出验收说明',
      '只汇报改了哪些文件',
      '只汇报测试结果',
      '停止扩 scope',
      '停止扩建的项目',           // 含 "停止扩"
      '当前优先级调整为：只做验收',
      '当前优先级调整了吗',       // 含 "当前优先级"
      '先不继续做新功能',
      '先不继续做的事情',        // 含 "先不继续做"
      '请现在不要继续写代码',
      '验收说明',
      '测试结果',
      '测试结果汇总发我',         // 含 "测试结果" 开头
      '改了哪些文件',
      '改了哪些颜色的主题',       // 含 "改了哪些" 开头
      '汇报',
      '继续 Phase 2',
      '严格遵守之前的约束',
      '目标：修复这个问题',
      '要求：不做 Fusion Registry',
    ];

    it.each(bypassPrompts)('"%s" → bypass', (prompt) => {
      expect(isMetaPrompt(prompt)).toBe(true);
    });
  });

  describe('should NOT trigger bypass', () => {
    const normalPrompts = [
      '帮我写一个函数',
      '修复这个 bug',
      '/team 帮我重构后端',
      '帮我润色代码',
      '调研一下 MCP 方案',
      '不要的代码删掉',        // "不要的" 不含 "不要继续"
      '汇报一下进度',          // "汇报一下" 不含 "只汇报" 或 "汇报$"
      '验收测试怎么跑',        // "验收测试" 不含 "验收说明"
      'hello world',          // 纯英文非控制语
      '设计一个系统架构',      // 普通开发请求
      '修一下这个 typo',      // 普通开发请求
    ];

    it.each(normalPrompts)('"%s" → no bypass', (prompt) => {
      expect(isMetaPrompt(prompt)).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    it('matches chinese uppercase', () => {
      expect(isMetaPrompt('不要继续')).toBe(true);
    });
    // English meta prompts not supported in current patterns — this is intentional
    it('English meta prompts not in scope', () => {
      expect(isMetaPrompt("DON'T CONTINUE")).toBe(false);
    });
  });

  describe('boundary: partial word should not match', () => {
    it('"汇报一下" contains 汇报 but starts with extra char', () => {
      expect(isMetaPrompt('汇报一下')).toBe(false);
    });
    it('"不要的" starts with 不要 but missing 继续', () => {
      expect(isMetaPrompt('不要的代码')).toBe(false);
    });
  });
});
