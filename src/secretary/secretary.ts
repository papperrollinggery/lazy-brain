/**
 * LazyBrain — Secretary Layer
 *
 * 用小模型（MiniMax-M2.7）做快速工具检索和意图判断。
 * 它不替代主模型思考，只是帮主模型从 491+ 工具里快速定位。
 *
 * 设计原则：
 * - 快速失败：timeout 2s，超时返回 null（fallback 到本地结果）
 * - 成本控制：rate limit 30s，circuit breaker 连续 3 次失败后熔断 10 分钟
 * - 输入精简：只发 top-20 候选的 name+category+scenario，约 1200 tokens
 */

import type { Capability, SecretaryResponse, HistoryEntry, UserProfile } from '../types.js';
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
import type { HistoryHint } from './prompt-templates.js';

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

// ─── History Hints ────────────────────────────────────────────────────────────

// ─── History Hints (time-decayed) ─────────────────────────────────────────────

function decayWeight(timestamp: string): number {
  const ageMs = Date.now() - new Date(timestamp).getTime();
  const hours = ageMs / 3_600_000;
  if (hours < 1) return 1.0;      // 短期：当前 session
  if (hours < 168) return 0.5;    // 中期：7 天内
  return 0.2;                      // 长期：历史偏好
}

export function buildHistoryHints(history: HistoryEntry[], topN = 5): HistoryHint[] {
  const stats = new Map<string, { weightedCount: number; weightedAccepted: number; rawCount: number }>();
  for (const entry of history) {
    const key = entry.matched;
    const w = decayWeight(entry.timestamp);
    const s = stats.get(key) ?? { weightedCount: 0, weightedAccepted: 0, rawCount: 0 };
    s.weightedCount += w;
    s.rawCount++;
    if (entry.accepted) s.weightedAccepted += w;
    stats.set(key, s);
  }
  return [...stats.entries()]
    .map(([name, s]) => ({
      name,
      count: s.rawCount,
      acceptRate: s.weightedCount > 0 ? s.weightedAccepted / s.weightedCount : 0,
      recency: s.weightedCount,  // 时间衰减后的加权频次
    }))
    .sort((a, b) => b.recency - a.recency)
    .slice(0, topN);
}

// ─── Secretary ────────────────────────────────────────────────────────────────

export interface SecretaryOptions {
  apiBase: string;
  apiKey: string;
  model: string;
  historyHints?: HistoryHint[];
  profile?: UserProfile | null;
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
  const prompt = makeSecretaryPrompt(userPrompt, slimCandidates, taskType, options.historyHints, options.profile);

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

    const raw = JSON.parse(cleaned);

    // 兼容旧格式（primary/secondary）和新格式（needsTool/tasks）
    let result: SecretaryResponse;
    if ('needsTool' in raw) {
      result = raw as SecretaryResponse;
    } else {
      // 旧格式适配
      result = {
        needsTool: true,
        intent: raw.plan ?? '',
        tasks: [
          { action: raw.primary, reason: raw.plan ?? '' },
          ...(raw.secondary ?? []).map((s: string) => ({ action: s, reason: '' })),
        ],
        confidence: raw.confidence ?? 0.5,
        plan: raw.plan ?? '',
        reasoning: raw.reasoning ?? '',
      };
    }

    if (result.needsTool && result.tasks.length === 0) {
      throw new Error('needsTool=true but no tasks');
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
