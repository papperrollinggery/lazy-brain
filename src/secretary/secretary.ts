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
  SECRETARY_CIRCUIT_BREAKER_THRESHOLD,
  SECRETARY_CIRCUIT_BREAKER_PAUSE_MS,
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
  if (consecutiveFailures < SECRETARY_CIRCUIT_BREAKER_THRESHOLD) return false;
  const elapsed = Date.now() - circuitOpenedAt;
  if (elapsed > SECRETARY_CIRCUIT_BREAKER_PAUSE_MS) {
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
  if (isCircuitOpen()) {
    process.stderr.write('[LazyBrain] Secretary circuit open, skipping\n');
    return null;
  }

  if (isRateLimited()) {
    return null;
  }

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

    const response = await Promise.race([
      llm.complete(prompt, SECRETARY_SYSTEM_PROMPT),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Secretary timeout')), SECRETARY_TIMEOUT_MS),
      ),
    ]);

    const cleaned = response.content
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<think>[\s\S]*/g, '')
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();

    if (!cleaned) throw new Error('Empty response');

    const result = JSON.parse(cleaned) as SecretaryResponse;

    if (!result.primary || typeof result.confidence !== 'number') {
      throw new Error('Invalid response structure');
    }

    consecutiveFailures = 0;

    return result;
  } catch (err) {
    consecutiveFailures++;
    if (consecutiveFailures >= SECRETARY_CIRCUIT_BREAKER_THRESHOLD) {
      circuitOpenedAt = Date.now();
      process.stderr.write(`[LazyBrain] Secretary circuit opened after ${consecutiveFailures} failures\n`);
    }
    process.stderr.write(`[LazyBrain] Secretary error: ${err instanceof Error ? err.message : String(err)}\n`);
    return null;
  }
}
