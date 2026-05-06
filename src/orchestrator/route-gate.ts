import type { RouteMode } from '../types.js';

export type RouteGateCategory = 'simple' | 'vague' | 'complex' | 'high_risk' | 'routing';

export interface RouteGateDecision {
  mode: RouteMode;
  shouldCallLazyBrain: boolean;
  category: RouteGateCategory;
  reason: string;
}

const COUNCIL_PATTERN = /\b(council|council mode|escalation|tradeoff|trade-off|irreversible|architecture decision|cost decision)\b|议会|議會|议会模式|議會模式|取舍|取捨|裁决|裁決|不可逆|架构决策|架構決策|成本决策|成本決策/iu;
const COMPLEX_PATTERN = /\b(dashboard|redesign|frontend|ui|ux|review|regression|debug|bug|stuck|hang|release|publish|audit|privacy|rollback|hook|agent|team|subagent|multi-agent|mcp|embedding|semantic|architecture|refactor|migration|docs|readme|test|build|lint|ci|workflow|pull request|pr|council|escalation|tradeoff|trade-off|architecture decision|cost decision)\b|看板|仪表盘|页面|界面|前端|重构|审查|回归|排查|调试|卡住|无输出|发布|公开|隐私|回滚|安装|钩子|hook|智能体|子智能体|多智能体|编排|架构|迁移|文档|测试|构建|质量|审核|开\s*PR|创建\s*PR|发\s*PR|提\s*PR|议会|議會|取舍|取捨|裁决|裁決|不可逆|设计一个|设计个|写一个|写个|做个|做一个|帮我写|帮我做|帮我改|帮我设计/iu;
const HIGH_RISK_PATTERN = /\b(delete|remove|reset|force push|global|publish|release|secret|token|credential|private|rollback|hook|install|production|prod|deploy|irreversible)\b|删除|清理|重置|强推|全局|发布|生产|密钥|隐私|回滚|安装|钩子|hook|不可逆/iu;
const VAGUE_PATTERN = /有点乱|怎么安排|你看怎么|看一下|帮我看看|不知道|随便|优化一下|弄一下|搞一下|不太懂|模糊|先看看|\b(fix this|make it better|clean this up|help me|figure it out|take a look)\b/iu;
const SIMPLE_PATTERN = /\b(what is|who is|translate|rename|typo|fix typo|change text|small copy|current time|date)\b|是什么|是谁|几点|日期|翻译|错别字|改文案|按钮文字|改个字|小改/iu;

export function classifyRouteNeed(query: string): RouteGateDecision {
  const q = query.trim();
  if (!q) {
    return {
      mode: 'no_route_needed',
      shouldCallLazyBrain: false,
      category: 'simple',
      reason: 'Empty query has nothing to route.',
    };
  }

  const highRisk = HIGH_RISK_PATTERN.test(q);
  const council = COUNCIL_PATTERN.test(q);
  const complex = COMPLEX_PATTERN.test(q);
  const vague = VAGUE_PATTERN.test(q);
  const simple = SIMPLE_PATTERN.test(q) && !complex && !highRisk;

  if (council && !highRisk) {
    return {
      mode: 'route_plan',
      shouldCallLazyBrain: true,
      category: 'complex',
      reason: 'The task asks for council-style escalation where routing should frame options, tradeoffs, and verification before deciding.',
    };
  }

  if (vague && !complex && !highRisk) {
    return {
      mode: 'needs_clarification',
      shouldCallLazyBrain: true,
      category: 'vague',
      reason: 'The request is vague enough that routing should clarify task surface before loading skills.',
    };
  }

  if (highRisk) {
    return {
      mode: 'route_plan',
      shouldCallLazyBrain: true,
      category: 'high_risk',
      reason: 'The task touches high-risk surfaces where guardrails and verification planning reduce mistakes.',
    };
  }

  if (complex) {
    return {
      mode: 'route_plan',
      shouldCallLazyBrain: true,
      category: 'complex',
      reason: 'The task is non-trivial and benefits from top-K skill routing and verification planning.',
    };
  }

  const hasCJK = /[一-鿿㐀-䶿]/.test(q);
  const shortThreshold = hasCJK ? 8 : 28;
  if (simple || q.length <= shortThreshold) {
    return {
      mode: 'no_route_needed',
      shouldCallLazyBrain: false,
      category: 'simple',
      reason: 'The task appears small enough to handle directly without routing overhead.',
    };
  }

  return {
    mode: 'route_plan',
    shouldCallLazyBrain: true,
    category: 'routing',
    reason: 'The task may benefit from a compact route plan before the main model spends context.',
  };
}
