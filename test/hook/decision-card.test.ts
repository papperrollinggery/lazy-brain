import { describe, expect, it } from 'vitest';
import {
  explainMatch,
  formatDecisionCard,
  formatDecisionCardCompact,
} from '../../src/hook/decision-card.js';
import type { Capability, MatchResult } from '../../src/types.js';

function cap(overrides: Partial<Capability> = {}): Capability {
  return {
    id: 'cap-1',
    kind: 'skill',
    name: 'code-review',
    description: 'Review code before merge',
    origin: 'test',
    status: 'installed',
    compatibility: ['claude-code'],
    tags: ['review', 'code'],
    exampleQueries: ['review this PR'],
    category: 'code-quality',
    ...overrides,
  };
}

function match(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    capability: cap(),
    score: 0.91,
    layer: 'tag',
    confidence: 'high',
    ...overrides,
  };
}

describe('decision card', () => {
  it('prefers explicit explanation over generated fallback', () => {
    const result = match({ explanation: '你提到了 review，历史上也常用这个工具。' });
    expect(explainMatch(result, 'review this')).toBe('你提到了 review，历史上也常用这个工具。');
  });

  it('builds explanation from layer, platform, and history signals', () => {
    const result = match({
      historyBoost: 0.12,
      capability: cap({ compatibility: ['codex', 'universal'] }),
    });
    const explanation = explainMatch(result, 'review code');
    expect(explanation).toContain('命中了工具标签和示例用法');
    expect(explanation).toContain('跨平台能力');
    expect(explanation).toContain('历史偏好');
  });

  it('formats a compact visible decision notice', () => {
    const output = formatDecisionCard({
      query: '帮我审查这个 PR',
      topMatch: match({ explanation: '你提到审查 PR，这正是 code-review 的典型用法。' }),
      alternates: [
        match({ capability: cap({ id: 'cap-2', name: 'critic' }), score: 0.78 }),
        match({ capability: cap({ id: 'cap-3', name: 'review' }), score: 0.71 }),
      ],
      lookupSavings: 3,
    });

    expect(output.split('\n')).toHaveLength(3);
    expect(output).toContain('LazyBrain 选工具: /code-review [91%]');
    expect(output).toContain('原因: 你提到审查 PR');
    expect(output).toContain('备选 /critic [78%], /review [71%]');
    expect(output).toContain('省 3 次查找');
    expect(output).not.toContain('━━━');
    expect(output).not.toContain('分隔');
  });

  it('formats compact fallback without decorative quote wrappers around tools', () => {
    const output = formatDecisionCardCompact('debugger', 0.56, [
      { name: 'investigate', score: 0.48 },
    ]);

    expect(output).toContain('/debugger (56%)');
    expect(output).toContain('/investigate (48%)');
    expect(output).not.toContain('/「');
  });
});
