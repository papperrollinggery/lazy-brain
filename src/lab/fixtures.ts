export type LabMode = 'regular' | 'subagent' | 'team' | 'needs_clarification';

export interface LabCase {
  id: string;
  title: string;
  query: string;
  expectedIntent: string;
  expectedMode: LabMode;
  tags: string[];
}

export const LAB_FIXTURES: LabCase[] = [
  {
    id: 'vague-voice',
    title: '模糊语音',
    query: '这个项目有点乱，你看怎么安排',
    expectedIntent: '把模糊输入澄清为可执行计划',
    expectedMode: 'needs_clarification',
    tags: ['voice', 'ambiguous', 'planning'],
  },
  {
    id: 'token-saving',
    title: '省 token',
    query: '怎么让 Claude 少消耗 token',
    expectedIntent: '给出 token 节省策略',
    expectedMode: 'subagent',
    tags: ['token', 'cost', 'strategy'],
  },
  {
    id: 'safe-hook-install',
    title: '安全安装审查',
    query: '检查公开安装 hook 的隐私和回滚风险',
    expectedIntent: '审查 hook 安装风险',
    expectedMode: 'subagent',
    tags: ['hook', 'security', 'privacy'],
  },
  {
    id: 'agent-agency',
    title: 'Agent Agency',
    query: '推荐哪些子智能体和提示词',
    expectedIntent: '推荐可用子智能体和任务提示词',
    expectedMode: 'team',
    tags: ['agent', 'subagent', 'prompt'],
  },
  {
    id: 'idle-debug',
    title: '长时间无输出 debug',
    query: '长时间无输出后卡住，帮我排查',
    expectedIntent: '定位长时间无输出后的卡住原因',
    expectedMode: 'subagent',
    tags: ['debug', 'runtime', 'stuck'],
  },
  {
    id: 'product-value',
    title: '产品价值',
    query: '这个工具怎么变得更有用',
    expectedIntent: '从用户视角提出产品改进',
    expectedMode: 'needs_clarification',
    tags: ['product', 'ambiguous', 'strategy'],
  },
  {
    id: 'public-docs',
    title: '普通用户文档',
    query: '把安装流程写给普通用户',
    expectedIntent: '生成面向普通用户的安装说明',
    expectedMode: 'regular',
    tags: ['docs', 'onboarding'],
  },
  {
    id: 'regression-review',
    title: '回归审查',
    query: '审查这次改动有没有回归风险',
    expectedIntent: '检查变更风险和测试缺口',
    expectedMode: 'subagent',
    tags: ['review', 'risk', 'testing'],
  },
];
