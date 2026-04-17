export type DecisionType =
  | 'analysis'
  | 'complex_impl'
  | 'ambiguous'
  | 'research'
  | 'team_task'
  | null;

export interface DecisionRecommendation {
  type: DecisionType;
  reason: string;
  suggestedTools: string[];
  note: string;
}

export const DECISION_RULES: Array<{
  type: Exclude<DecisionType, null>;
  patterns: RegExp[];
  reason: string;
  tools: string[];
  note: string;
}> = [
  {
    type: 'analysis',
    patterns: [/分析|评估|审查|为什么|怎么看|对比|review/i, /\banalyz\w*|evaluat\w*|assess\w*|review/i],
    reason: '用户请求分析或评估某个内容',
    tools: ['critic', 'ralplan', 'code-reviewer'],
    note: '建议先用 critic 预审，再根据反馈决定下一步',
  },
  {
    type: 'complex_impl',
    patterns: [/实现|重构|改造|迁移/i, /\bimplement\w*|refactor\w*|restructur\w*|migrat\w*/i],
    reason: '涉及复杂实现或重构，query 较长表明任务复杂',
    tools: ['planner', 'architect', 'team', 'executor'],
    note: '建议先用 planner 做任务拆解，再决定是否需要 team',
  },
  {
    type: 'ambiguous',
    patterns: [/怎么办|设计|想想|建议/i, /\bhow\s+(to|should)|think|design|suggest\w*/i],
    reason: '需求模糊或不明确，需要澄清或探索',
    tools: ['deep-interview', 'analyst', 'critic'],
    note: '建议先用 deep-interview 澄清需求，避免过早进入实现',
  },
  {
    type: 'research',
    patterns: [/调研|了解|对比|Search|research/i, /\bresearch\w*|explor\w*|investigat\w*|search\w*/i],
    reason: '用户想要调研或了解某个领域',
    tools: ['explore', 'deep-dive', 'document-specialist'],
    note: '建议用 explore 做初步调研，再深入具体方向',
  },
  {
    type: 'team_task',
    patterns: [/\/team|team模式|多agent|组队/i, /\bteam\s+(task|work|build)/i],
    reason: '用户明确要求多 agent 协作',
    tools: ['team', 'ralplan'],
    note: '建议用 team 命令启动多 agent 协作模式',
  },
];

export function detectDecisionType(query: string): DecisionType {
  const len = query.length;

  for (const rule of DECISION_RULES) {
    const matched = rule.patterns.some(p => p.test(query));
    if (!matched) continue;

    if (rule.type === 'complex_impl' && len < 60) {
      continue;
    }

    if (rule.type === 'ambiguous') {
      const hasSpecifics = /src\/|\.(ts|py|js|go|java|rs|cpp|md)(\s|:|$)|line\s+\d+/i.test(query);
      if (hasSpecifics) continue;
    }

    return rule.type;
  }

  return null;
}

export function buildDecisionRecommendation(
  type: DecisionType,
): DecisionRecommendation | null {
  if (!type) return null;

  const rule = DECISION_RULES.find(r => r.type === type);
  if (!rule) return null;

  return {
    type: rule.type,
    reason: rule.reason,
    suggestedTools: rule.tools,
    note: rule.note,
  };
}
