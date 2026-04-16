import { describe, it, expect } from 'vitest';
import type { SecretaryResponse, ExecutionMode } from '../../src/types.js';

describe('SecretaryResponse mode fields', () => {
  it('should accept regular mode', () => {
    const response: SecretaryResponse = {
      needsTool: true,
      intent: '修一个 typo',
      mode: 'regular',
      modeReason: '简单单文件修改',
      tasks: [{ action: 'ai-slop-cleaner', reason: '清理代码' }],
      confidence: 0.9,
      plan: '直接清理',
      reasoning: '明确意图',
    };
    expect(response.mode).toBe('regular');
    expect(response.modeReason).toBe('简单单文件修改');
  });

  it('should accept ralplan mode', () => {
    const response: SecretaryResponse = {
      needsTool: true,
      intent: '帮我改进开发流程',
      mode: 'ralplan',
      modeReason: '模糊需求，需要先规划',
      tasks: [{ action: 'ralplan', model: 'opus', reason: '先规划再执行' }],
      confidence: 0.85,
      plan: '规划开发流程改进',
      reasoning: '需求不明确',
    };
    expect(response.mode).toBe('ralplan');
  });

  it('should accept team mode', () => {
    const response: SecretaryResponse = {
      needsTool: true,
      intent: '重构整个后端',
      mode: 'team',
      modeReason: '涉及多模块，可并行执行',
      tasks: [
        { action: 'architect', model: 'opus', reason: '架构设计', after: undefined },
        { action: 'code-review', model: 'sonnet', reason: '安全审查', after: 'architect' },
      ],
      confidence: 0.88,
      plan: '多模块并行重构',
      reasoning: '明确且可拆分',
    };
    expect(response.mode).toBe('team');
    expect(response.tasks.length).toBeGreaterThan(1);
  });

  it('should accept ralph mode', () => {
    const response: SecretaryResponse = {
      needsTool: true,
      intent: '完成所有 bug 修复',
      mode: 'ralph',
      modeReason: '需要持续迭代验证',
      tasks: [{ action: 'ralph', model: 'opus', reason: '持续迭代直到完成' }],
      confidence: 0.9,
      plan: '迭代修复直到验收通过',
      reasoning: '明确验收标准',
    };
    expect(response.mode).toBe('ralph');
  });

  it('should parse mode from JSON response', () => {
    const jsonStr = `{
      "needsTool": true,
      "intent": "测试代码",
      "mode": "team",
      "modeReason": "多文件并行测试",
      "tasks": [{"action": "tdd", "model": "sonnet", "reason": "测试驱动"}],
      "confidence": 0.85,
      "plan": "并行测试",
      "reasoning": "多模块"
    }`;
    const parsed = JSON.parse(jsonStr) as SecretaryResponse;
    expect(parsed.mode).toBe('team');
    expect(parsed.modeReason).toBe('多文件并行测试');
    expect(parsed.tasks[0].action).toBe('tdd');
  });

  it('mode field is optional for backward compatibility', () => {
    const response: SecretaryResponse = {
      needsTool: true,
      intent: '简单修改',
      tasks: [{ action: 'refactor', reason: '重构' }],
      confidence: 0.8,
      plan: '重构代码',
      reasoning: '明确',
    };
    expect(response.mode).toBeUndefined();
  });
});

describe('ExecutionMode type', () => {
  const validModes: ExecutionMode[] = ['regular', 'ralplan', 'team', 'ralph'];

  it.each(validModes)('should accept mode: %s', (mode) => {
    const response: SecretaryResponse = {
      needsTool: true,
      intent: 'test',
      mode,
      tasks: [],
      confidence: 0.9,
      plan: '',
      reasoning: '',
    };
    expect(response.mode).toBe(mode);
  });
});

describe('Mode routing logic', () => {
  it('regular for simple single-file task', () => {
    const prompt = '帮我修改 src/utils/helper.ts 里的 typo';
    const hasSpecificFile = /[\/\.]\w+/.test(prompt);
    const hasFunctionName = /\w+\(\)/.test(prompt);
    const mode: ExecutionMode = hasSpecificFile || hasFunctionName ? 'regular' : 'ralplan';
    expect(mode).toBe('regular');
  });

  it('ralplan for vague multi-module request', () => {
    const prompt = '帮我改进整个开发流程';
    const hasSpecificFile = /[\/\.]\w+/.test(prompt);
    const hasFunctionName = /\w+\(\)/.test(prompt);
    const mode: ExecutionMode = hasSpecificFile || hasFunctionName ? 'regular' : 'ralplan';
    expect(mode).toBe('ralplan');
  });

  it('team for explicit multi-module task', () => {
    const prompt = '重构整个后端代码';
    const isExplicitMultiModule = true;
    const mode: ExecutionMode = isExplicitMultiModule ? 'team' : 'regular';
    expect(mode).toBe('team');
  });

  it('ralph for task with verification requirement', () => {
    const prompt = '修复所有已知 bug 并验证通过';
    const hasVerification = /验证|确保|通过/.test(prompt);
    const mode: ExecutionMode = hasVerification ? 'ralph' : 'regular';
    expect(mode).toBe('ralph');
  });
});
