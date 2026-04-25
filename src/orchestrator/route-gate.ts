import type { RouteMode } from '../types.js';

export type RouteGateCategory = 'simple' | 'vague' | 'complex' | 'high_risk' | 'routing';

export interface RouteGateDecision {
  mode: RouteMode;
  shouldCallLazyBrain: boolean;
  category: RouteGateCategory;
  reason: string;
}

const COMPLEX_PATTERN = /\b(dashboard|redesign|frontend|ui|ux|review|regression|debug|bug|stuck|hang|release|publish|audit|privacy|rollback|hook|agent|team|subagent|multi-agent|mcp|embedding|semantic|architecture|refactor|migration|docs|readme|test|build|lint|ci|workflow)\b|看板|仪表盘|页面|界面|前端|重构|审查|回归|排查|调试|卡住|无输出|发布|公开|隐私|回滚|安装|钩子|hook|智能体|子智能体|多智能体|编排|架构|迁移|文档|测试|构建|质量|审核/iu;
const HIGH_RISK_PATTERN = /\b(delete|remove|reset|force push|global|publish|release|secret|token|credential|private|rollback|hook|install|production|prod|deploy)\b|删除|清理|重置|强推|全局|发布|生产|密钥|隐私|回滚|安装|钩子|hook/iu;
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
  const complex = COMPLEX_PATTERN.test(q);
  const vague = VAGUE_PATTERN.test(q);
  const simple = SIMPLE_PATTERN.test(q) && !complex && !highRisk;

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

  if (simple || q.length <= 28) {
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
