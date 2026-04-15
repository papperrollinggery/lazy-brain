# Task: 秘书层 — Secretary Core

## 背景

LazyBrain v2 的核心新功能：当本地 tag 匹配置信度不足时（score 0.5-0.85 或 <0.5），
调用 MiniMax-M2.7 作为"秘书智能体"，对用户意图做深度分析，返回推荐的 skill 组合和执行方案。

**前置条件：** task-v2-wiki-card.md 已完成（WikiCard、SecretaryConfig、SecretaryResponse 类型已存在）

## 步骤 1：新建 `src/secretary/prompt-templates.ts`

```typescript
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

/**
 * 根据 prompt 判断任务类型（本地规则，零成本）
 */
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
```

## 步骤 2：新建 `src/secretary/secretary.ts`

```typescript
/**
 * LazyBrain — Secretary Layer
 *
 * 当本地 tag 匹配置信度不足时，调用 MiniMax-M2.7 做深度分析。
 * 输入：用户 prompt + top-20 候选精简索引
 * 输出：推荐的 skill 组合 + 执行方案
 *
 * 设计原则：
 * - 快速失败：timeout 2s，超时返回 null（fallback 到本地结果）
 * - 成本控制：rate limit 30s，circuit breaker 连续 3 次失败后熔断 10 分钟
 * - 输入精简：只发 top-20 候选的 name+category+scenario，约 1200 tokens
 */

import type { Capability, SecretaryResponse } from '../types.js';
import { createLLMProvider } from '../compiler/llm-provider.js';
import {
  SECRETARY_TIMEOUT_MS,
  SECRETARY_RATE_LIMIT_MS,
  SECRETARY_CIRCUIT_BREAKER_LIMIT,
  SECRETARY_CIRCUIT_BREAKER_COOLDOWN_MS,
} from '../constants.js';
import {
  SECRETARY_SYSTEM_PROMPT,
  makeSecretaryPrompt,
  detectTaskType,
} from './prompt-templates.js';

// ─── Circuit Breaker State ────────────────────────────────────────────────────
// 注意：hook 是 fork 新进程模式，这些状态在进程间不共享。
// 但在同一进程内（如 CLI 调用）可以防止连续失败。

let consecutiveFailures = 0;
let circuitOpenedAt = 0;
let lastCallAt = 0;

function isCircuitOpen(): boolean {
  if (consecutiveFailures < SECRETARY_CIRCUIT_BREAKER_LIMIT) return false;
  const elapsed = Date.now() - circuitOpenedAt;
  if (elapsed > SECRETARY_CIRCUIT_BREAKER_COOLDOWN_MS) {
    // 冷却结束，重置
    consecutiveFailures = 0;
    circuitOpenedAt = 0;
    return false;
  }
  return true;
}

function isRateLimited(): boolean {
  return Date.now() - lastCallAt < SECRETARY_RATE_LIMIT_MS;
}

// ─── Secretary ────────────────────────────────────────────────────────────────

export interface SecretaryOptions {
  apiBase: string;
  apiKey: string;
  model: string;
}

/**
 * 调用秘书层，返回推荐结果。
 * 失败时返回 null（调用方 fallback 到本地结果）。
 */
export async function askSecretary(
  userPrompt: string,
  candidates: Capability[],
  options: SecretaryOptions,
): Promise<SecretaryResponse | null> {
  // 检查 circuit breaker
  if (isCircuitOpen()) {
    process.stderr.write('[LazyBrain] Secretary circuit open, skipping\n');
    return null;
  }

  // 检查 rate limit
  if (isRateLimited()) {
    return null;
  }

  // 精简候选列表（只取 top-20，只发 name+category+scenario）
  const slimCandidates = candidates.slice(0, 20).map(c => ({
    name: c.name,
    category: c.category,
    scenario: c.scenario ?? c.description.slice(0, 60),
  }));

  const taskType = detectTaskType(userPrompt);
  const prompt = makeSecretaryPrompt(userPrompt, slimCandidates, taskType);

  try {
    lastCallAt = Date.now();

    const llm = createLLMProvider({
      model: options.model,
      apiBase: options.apiBase,
      apiKey: options.apiKey,
    });

    // 带 timeout 的 LLM 调用
    const response = await Promise.race([
      llm.complete(prompt, SECRETARY_SYSTEM_PROMPT),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Secretary timeout')), SECRETARY_TIMEOUT_MS),
      ),
    ]);

    // 解析 JSON 响应（复用 compiler 的 parseJsonResponse 逻辑）
    const cleaned = response.content
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<think>[\s\S]*/g, '')
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();

    if (!cleaned) throw new Error('Empty response');

    const result = JSON.parse(cleaned) as SecretaryResponse;

    // 验证必要字段
    if (!result.primary || typeof result.confidence !== 'number') {
      throw new Error('Invalid response structure');
    }

    // 成功，重置失败计数
    consecutiveFailures = 0;

    return result;
  } catch (err) {
    consecutiveFailures++;
    if (consecutiveFailures >= SECRETARY_CIRCUIT_BREAKER_LIMIT) {
      circuitOpenedAt = Date.now();
      process.stderr.write(`[LazyBrain] Secretary circuit opened after ${consecutiveFailures} failures\n`);
    }
    process.stderr.write(`[LazyBrain] Secretary error: ${err instanceof Error ? err.message : String(err)}\n`);
    return null;
  }
}
```

## 步骤 3：验证

```bash
npm run build
# 确认编译通过

# 手动测试秘书层（需要 MiniMax API 可用）
node -e "
import('./dist/index.js').then(async () => {
  // 只验证 build 通过，不实际调用 API
  console.log('Secretary module loaded OK');
});
"
```

## 注意事项

- `secretary.ts` 里的 circuit breaker 状态是进程级的，hook fork 模式下每次都是新进程，状态不持久。这是已知限制，可接受（hook 场景下 rate limit 更重要）
- `parseJsonResponse` 的逻辑在 secretary.ts 里内联了一份，避免循环依赖（compiler 依赖 types，secretary 也依赖 types）
- timeout 用 `Promise.race`，不用 `AbortController`（Node 18 兼容性更好）
