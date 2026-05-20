import { loadRecent } from '../history/history.js';
import type { HistoryEntry } from '../history/history.js';
import { learnedSignals } from '../insights/patterns.js';
import { matchRules } from './rules.js';
import type { Enhancement } from './types.js';
import type { EngineOptions, OrchestrationPlan, TaskSignal } from './types.js';

const DEFAULTS = {
  autoActivate: false,
  confidenceThreshold: 0.85,
  maxEnhancements: 5,
};
const LEARNED_CACHE_TTL_MS = 5000;

type EngineOptionsWithHistory = EngineOptions & { learnedHistory?: HistoryEntry[] };
type LearnedSignal = ReturnType<typeof learnedSignals>[number];

let learnedCache: { expiresAt: number; signals: LearnedSignal[] } | null = null;

function signalText(signal: TaskSignal): string {
  return `${signal.content} ${(signal.context.files_changed ?? []).join(' ')}`.toLowerCase();
}

function triggerMatches(signal: TaskSignal, trigger: string): boolean {
  const text = signalText(signal);
  const normalized = trigger.toLowerCase();
  const readable = normalized.replace(/[-_]/g, ' ');
  return text.includes(normalized) || text.includes(readable) || text.includes(`/${normalized}`);
}

function learnedEnhancement(name: string, index: number): Enhancement {
  return {
    type: 'skill',
    name,
    priority: index + 1,
    reason: 'frequent accepted workflow from local history',
  };
}

function recentLearnedSignals(options: EngineOptionsWithHistory): LearnedSignal[] {
  if (options.learnedHistory) return learnedSignals(options.learnedHistory);
  const now = Date.now();
  if (learnedCache && learnedCache.expiresAt > now) return learnedCache.signals;
  const signals = learnedSignals(loadRecent(30));
  learnedCache = { expiresAt: now + LEARNED_CACHE_TTL_MS, signals };
  return signals;
}

export function resetOrchestrationCache(): void {
  learnedCache = null;
}

function matchLearned(signal: TaskSignal, options: EngineOptionsWithHistory): OrchestrationPlan | null {
  try {
    const candidates = recentLearnedSignals(options)
      .filter((item) => item.sequence.length > 0 && triggerMatches(signal, item.trigger))
      .map((item) => ({
        trigger: signal,
        enhancements: item.sequence.map(learnedEnhancement),
        sequence: 'sequential' as const,
        confidence: item.confidence,
        reason: `learned frequent workflow: ${item.sequence.join(' -> ')}`,
        autoActivate: false,
      }))
      .sort((a, b) => b.confidence - a.confidence);
    return candidates[0] ?? null;
  } catch {
    return null;
  }
}

export function orchestrate(signal: TaskSignal, options: EngineOptionsWithHistory = {}): OrchestrationPlan | null {
  const merged = { ...DEFAULTS, ...options };
  if (merged.maxEnhancements <= 0) return null;
  const rulePlan = matchRules(signal, merged.disabledRules ?? []);
  const learnedPlan = matchLearned(signal, merged);
  const plan = learnedPlan && (!rulePlan || learnedPlan.confidence > rulePlan.confidence) ? learnedPlan : rulePlan;
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
