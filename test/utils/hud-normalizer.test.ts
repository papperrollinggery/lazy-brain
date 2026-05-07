import { describe, expect, it } from 'vitest';
import { simplifyUpstreamHud, isLowSignalLazyBrainLabel } from '../../src/utils/hud-normalizer.js';

describe('simplifyUpstreamHud', () => {
  it('compresses verbose Tokens breakdown', () => {
    expect(simplifyUpstreamHud('Tokens 28.8M (in: 20.2M, out: 114k, cache: 8.5M)'))
      .toBe('累计消耗 28.8M tok');
  });

  it('compresses verbose tok breakdown', () => {
    expect(simplifyUpstreamHud('tok: 28.8M (in: 20.2M, out: 114k)'))
      .toBe('累计消耗 28.8M tok');
  });

  it('keeps unrelated text unchanged', () => {
    expect(simplifyUpstreamHud('[Opus] 12%')).toBe('[Opus] 12%');
  });
});

describe('isLowSignalLazyBrainLabel', () => {
  it('hides dormant LazyBrain labels in combined HUD', () => {
    expect(isLowSignalLazyBrainLabel('🧠 0秒前 已跳过')).toBe(true);
    expect(isLowSignalLazyBrainLabel('\u001b[2m🧠 待机中\u001b[0m')).toBe(true);
    expect(isLowSignalLazyBrainLabel('🧠 上次 36分前 api code_review_regression [86%]')).toBe(true);
  });

  it('keeps active labels visible', () => {
    expect(isLowSignalLazyBrainLabel('🧠 /review-pr [43%]')).toBe(false);
    expect(isLowSignalLazyBrainLabel('🧠 思考中')).toBe(false);
    expect(isLowSignalLazyBrainLabel('🧠 3秒前 api 路由 Regression code review [86%]')).toBe(false);
  });
});
