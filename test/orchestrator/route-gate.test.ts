import { describe, expect, it } from 'vitest';
import { classifyRouteNeed } from '../../src/orchestrator/route-gate.js';

describe('classifyRouteNeed', () => {
  it('keeps tiny factual prompts out of routing', () => {
    const decision = classifyRouteNeed('what is TypeScript?');
    expect(decision.mode).toBe('no_route_needed');
    expect(decision.shouldCallLazyBrain).toBe(false);
  });

  it('routes high-risk install and hook tasks', () => {
    const decision = classifyRouteNeed('检查公开安装 hook 的隐私和回滚风险');
    expect(decision.mode).toBe('route_plan');
    expect(decision.shouldCallLazyBrain).toBe(true);
    expect(decision.category).toBe('high_risk');
  });

  it('clarifies vague voice-like prompts', () => {
    const decision = classifyRouteNeed('这个项目有点乱，你看怎么安排');
    expect(decision.mode).toBe('needs_clarification');
    expect(decision.shouldCallLazyBrain).toBe(true);
  });
});
