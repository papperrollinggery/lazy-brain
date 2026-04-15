/**
 * LazyBrain — Secretary Prompt Templates
 *
 * Secretary 是认知中间层的核心：不只是选工具，而是理解意图、拆解需求、编排执行方案。
 * 输入精简（控制 thinking token），输出结构化（JSON）。
 */

import type { UserProfile, TaskChain } from '../types.js';

export const SECRETARY_SYSTEM_PROMPT = `你是 LazyBrain 秘书——AI 编码 agent 的认知中间层。

你的职责不是简单选工具，而是：
1. 判断用户是否需要工具（闲聊/讨论/提问 → needsTool: false）
2. 理解用户真实意图，拆解为可执行的子任务
3. 为每个子任务推荐最合适的 skill + 模型
4. 考虑用户历史偏好

模型选择指南：
- opus: 复杂架构设计、深度分析、多文件重构
- sonnet: 日常编码、审查、测试、大多数任务
- haiku: 简单查询、格式化、快速操作

判断 needsTool 的标准：
- 用户在讨论、提问、闲聊、表达观点 → needsTool: false
- 用户有明确的执行意图（做、改、查、建、修、跑）→ needsTool: true
- 模糊但倾向于行动 → needsTool: true, confidence 降低

规则：
- 只能从候选列表中选择 action，不能推荐列表外的
- 返回严格的 JSON，不要有任何解释文字
- tasks 按执行顺序排列，用 after 字段标注依赖
- plan 不超过 80 字
- reasoning 不超过 50 字`;

export interface HistoryHint {
  name: string;
  count: number;
  acceptRate: number;
  /** 时间衰减后的加权频次（短期 1.0, 中期 0.5, 长期 0.2） */
  recency: number;
}

export function makeSecretaryPrompt(
  userPrompt: string,
  candidates: Array<{ name: string; category: string; scenario: string }>,
  taskType: 'code' | 'planning' | 'research' | 'other',
  historyHints?: HistoryHint[],
  profile?: UserProfile | null,
): string {
  const candidateList = candidates
    .map((c, i) => `${i + 1}. ${c.name} [${c.category}] — ${c.scenario || c.name}`)
    .join('\n');

  const historySection = historyHints && historyHints.length > 0
    ? `\n近期活跃工具:\n${historyHints.map(h => {
        const heat = h.recency > 3 ? '🔥' : h.recency > 1 ? '▲' : '·';
        return `  ${heat} ${h.name}: ${h.count}次, 接受率${Math.round(h.acceptRate * 100)}%`;
      }).join('\n')}\n`
    : '';

  // 用户画像摘要（从蒸馏后的 profile 提取）
  let profileSection = '';
  if (profile && profile.eventCount > 0) {
    const lines: string[] = [];
    // 常用工具 top-3
    const topTools = profile.toolAffinities.slice(0, 3);
    if (topTools.length > 0) {
      lines.push(`常用工具: ${topTools.map(t => `${t.name}(${t.totalUses}次/${Math.round(t.acceptRate * 100)}%)`).join(', ')}`);
    }
    // 任务链模式
    if (profile.taskChains.length > 0) {
      lines.push(`常见工作流: ${profile.taskChains.slice(0, 3).map(c => c.sequence.join('→')).join('; ')}`);
    }
    // 能力信号
    if (profile.advancedToolRatio > 0.3) {
      lines.push('用户画像: 高级用户，偏好复杂工具');
    } else if (profile.advancedToolRatio < 0.1) {
      lines.push('用户画像: 偏好基础工具，推荐简单直接的方案');
    }
    if (lines.length > 0) {
      profileSection = `\n用户画像 (蒸馏自 ${profile.eventCount} 条历史):\n${lines.map(l => `  ${l}`).join('\n')}\n`;
    }
  }

  return `用户输入: "${userPrompt}"
任务类型: ${taskType}
${historySection}${profileSection}
候选工具 (按相关度排序):
${candidateList}

返回 JSON（严格格式，不要 markdown）:
{
  "needsTool": true/false,
  "intent": "一句话意图摘要",
  "tasks": [
    { "action": "工具名", "model": "sonnet|opus|haiku", "reason": "为什么", "after": "前置工具名或null" }
  ],
  "confidence": 0.85,
  "plan": "执行方案（80字内）",
  "reasoning": "推理依据（50字内）"
}

如果 needsTool 为 false，tasks 返回空数组 []。`;
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
