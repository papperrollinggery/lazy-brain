/**
 * LazyBrain — Secretary Prompt Templates
 *
 * MiniMax-M2.7 作为秘书智能体的 prompt 模板。
 * 设计原则：输入精简（控制 thinking token），输出结构化（JSON）。
 */

export const SECRETARY_SYSTEM_PROMPT = `你是 LazyBrain 秘书，专门为 Claude Code 用户推荐最合适的 AI 编码工具。

你的任务：
1. 理解用户的意图
2. 从候选工具列表中选出最佳 1-3 个
3. 给出简洁的执行方案建议

规则：
- 只能从候选列表中选择，不能推荐列表外的工具
- 返回严格的 JSON，不要有任何解释文字
- confidence 是你对推荐准确性的评估（0.0-1.0）
- plan 不超过 50 字`;

export function makeSecretaryPrompt(
  userPrompt: string,
  candidates: Array<{ name: string; category: string; scenario: string }>,
  taskType: 'code' | 'planning' | 'research' | 'other',
): string {
  const candidateList = candidates
    .map((c, i) => `${i + 1}. ${c.name} [${c.category}] — ${c.scenario || c.name}`)
    .join('\n');

  return `用户意图: "${userPrompt}"
任务类型: ${taskType}

候选工具 (按相关度排序):
${candidateList}

返回 JSON（严格格式，不要 markdown）:
{
  "primary": "工具名",
  "secondary": ["工具名2"],
  "plan": "执行方案（50字内）",
  "confidence": 0.85
}`;
}

export function detectTaskType(prompt: string): 'code' | 'planning' | 'research' | 'other' {
  const lower = prompt.toLowerCase();
  const codeKeywords = ['代码', '函数', '修复', 'bug', 'fix', 'refactor', 'review', '审查', '测试', 'test', 'build', '编译', 'debug'];
  const planKeywords = ['计划', '方案', '架构', '设计', 'plan', 'design', 'architecture', 'prd', '需求'];
  const researchKeywords = ['搜索', '查找', '文档', 'search', 'find', 'docs', '研究', 'research'];

  if (codeKeywords.some(k => lower.includes(k))) return 'code';
  if (planKeywords.some(k => lower.includes(k))) return 'planning';
  if (researchKeywords.some(k => lower.includes(k))) return 'research';
  return 'other';
}
