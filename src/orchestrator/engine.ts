import { matchRules } from './rules.js';
import type { EngineOptions, OrchestrationPlan, TaskSignal } from './types.js';

const DEFAULTS = {
  autoActivate: false,
  confidenceThreshold: 0.85,
  maxEnhancements: 5,
};

export function orchestrate(signal: TaskSignal, options: EngineOptions = {}): OrchestrationPlan | null {
  const merged = { ...DEFAULTS, ...options };
  if (merged.maxEnhancements <= 0) return null;
  const plan = matchRules(signal, merged.disabledRules ?? []);
  if (!plan) return null;
  const enhancements = plan.enhancements.slice(0, merged.maxEnhancements);
  return {
    ...plan,
    enhancements,
    autoActivate: Boolean(merged.autoActivate && plan.confidence >= merged.confidenceThreshold),
  };
}

export function explain(plan: OrchestrationPlan): string {
  const skills = plan.enhancements.map((item) => `/${item.name}`).join(' -> ');
  const percent = Math.round(plan.confidence * 100);
  return `${skills} (${percent}%): ${plan.reason}`;
}

export function formatOrchestrationHint(plan: OrchestrationPlan): string {
  const skills = plan.enhancements.slice(0, 4).map((item) => `/${item.name}`).join(' → ');
  return `💡 Combo: ${skills} (${plan.reason})`;
}
