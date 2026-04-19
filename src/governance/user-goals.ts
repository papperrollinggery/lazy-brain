/**
 * LazyBrain — User Goals (Goal-First Pattern Mapping)
 *
 * Phase 3.x: Maps user query intent to high-level execution goals.
 * Each goal suggests a recommended execution pattern and tool sequence.
 */

import type { Recommendation } from '../types.js';
import type { TeamComposition } from '../matcher/team-recommender.js';

// ─── Goal Types ───────────────────────────────────────────────────────────────

export type GoalType = 'polish' | 'explore' | 'systematize';

/** A mapped goal with recommended execution approach */
export interface MappedGoal {
  goal: GoalType;
  /** Human-readable label */
  label: string;
  /** Why this goal was selected */
  reason: string;
  /** Suggested tool order */
  suggestedTools: string[];
  /** Whether this goal benefits from planning before execution */
  needsPlanning: boolean;
}

// ─── Goal Detection Rules ─────────────────────────────────────────────────────

const GOAL_RULES: Array<{
  goal: GoalType;
  patterns: RegExp[];
  label: string;
  suggestedTools: string[];
  needsPlanning: boolean;
}> = [
  {
    goal: 'polish',
    patterns: [
      /润色|优化|美化|整理|clean|polish|refine/i,
      /\bimprov\w*|optimiz\w*|beautif\w*/i,
      /改好|写好|调好|调优/i,
    ],
    label: '润色整理',
    suggestedTools: ['simplify', 'code-simplifier'],
    needsPlanning: false,
  },
  {
    goal: 'explore',
    patterns: [
      /调研|了解|探索|研究|search|research|explore|investigate/i,
      /搜一下|查一下|看看有哪些|有哪些方案/i,
      /\bhow\s+(to|about)|what\s+(is|are)\b/i,
    ],
    label: '探索调研',
    suggestedTools: ['explore', 'deep-dive'],
    needsPlanning: false,
  },
  {
    goal: 'systematize',
    patterns: [
      /系统设计|架构|整理成体系|系统化|体系化/i,
      /\barchitect\w*|system\s+design|\bdesign\s+pattern/i,
      /规范|标准化|最佳实践|迁移方案/i,
    ],
    label: '系统化',
    suggestedTools: ['architect', 'planner', 'ralplan'],
    needsPlanning: true,
  },
];

// ─── Goal Detection ───────────────────────────────────────────────────────────

/**
 * Detect the primary user goal from a query.
 * Returns null if no goal pattern matches.
 */
export function detectGoal(query: string): MappedGoal | null {
  for (const rule of GOAL_RULES) {
    const matched = rule.patterns.some(p => p.test(query));
    if (!matched) continue;
    return {
      goal: rule.goal,
      label: rule.label,
      reason: `命中关键词模式: ${rule.goal}`,
      suggestedTools: rule.suggestedTools,
      needsPlanning: rule.needsPlanning,
    };
  }
  return null;
}

/**
 * Enrich a Recommendation with goal context.
 * Attaches goal metadata to the top match if a goal was detected.
 */
export function enrichWithGoal(
  query: string,
  recommendation: Recommendation,
): Recommendation {
  const goal = detectGoal(query);
  if (!goal) return recommendation;
  return {
    ...recommendation,
    warnings: [
      ...(recommendation.warnings ?? []),
      `[Goal-First] 检测到目标: ${goal.label}（${goal.reason}）`,
    ],
  };
}

/**
 * Get suggested tool sequence for a given goal.
 */
export function getGoalTools(goal: GoalType): string[] {
  const rule = GOAL_RULES.find(r => r.goal === goal);
  return rule?.suggestedTools ?? [];
}

/**
 * Check if a goal requires planning before execution.
 */
export function goalNeedsPlanning(goal: GoalType): boolean {
  const rule = GOAL_RULES.find(r => r.goal === goal);
  return rule?.needsPlanning ?? false;
}
