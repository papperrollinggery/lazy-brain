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

import type { Capability, SecretaryResponse, HistoryEntry, UserProfile, Platform } from '../types.js';
import { createLLMProvider } from '../compiler/llm-provider.js';
import {
  SECRETARY_TIMEOUT_MS,
  SECRETARY_RATE_LIMIT_MS,
  SECRETARY_CIRCUIT_BREAKER_THRESHOLD,
  SECRETARY_CIRCUIT_BREAKER_PAUSE_MS,
  SECRETARY_CB_PATH,
} from '../constants.js';
import {
  SECRETARY_SYSTEM_PROMPT,
  makeSecretaryPrompt,
  detectTaskType,
} from './prompt-templates.js';
import type { HistoryHint } from './prompt-templates.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// ─── Circuit Breaker (file-based, survives hook restarts) ──────────────────
// Persists to ~/.lazybrain/.secretary-cb.json so state survives across hook invocations.

interface CircuitState {
  consecutiveFailures: number;
  openedAt: number;   // 0 = closed
  lastCallAt: number;
}

function readCircuitState(): CircuitState {
  try {
    if (existsSync(SECRETARY_CB_PATH)) {
      return JSON.parse(readFileSync(SECRETARY_CB_PATH, 'utf-8')) as CircuitState;
    }
  } catch {}
  return { consecutiveFailures: 0, openedAt: 0, lastCallAt: 0 };
}

function writeCircuitState(state: CircuitState): void {
  try {
    writeFileSync(SECRETARY_CB_PATH, JSON.stringify(state), 'utf-8');
  } catch {
    // Non-fatal: circuit breaker state loss just means more retries
  }
}

function recordFailure(): void {
  const state = readCircuitState();
  state.consecutiveFailures++;
  if (state.consecutiveFailures >= SECRETARY_CIRCUIT_BREAKER_THRESHOLD) {
    state.openedAt = Date.now();
  }
  writeCircuitState(state);
}

function recordSuccess(): void {
  const state = readCircuitState();
  state.consecutiveFailures = 0;
  state.openedAt = 0;
  state.lastCallAt = Date.now();
  writeCircuitState(state);
}

function isCircuitOpen(): boolean {
  const state = readCircuitState();
  if (state.consecutiveFailures < SECRETARY_CIRCUIT_BREAKER_THRESHOLD) return false;
  if (state.openedAt > 0 && Date.now() - state.openedAt > SECRETARY_CIRCUIT_BREAKER_PAUSE_MS) {
    // Auto-reset after pause
    const s = readCircuitState();
    s.consecutiveFailures = 0;
    s.openedAt = 0;
    writeCircuitState(s);
    return false;
  }
  return true;
}

function isRateLimited(): boolean {
  const state = readCircuitState();
  return Date.now() - state.lastCallAt < SECRETARY_RATE_LIMIT_MS;
}

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
    // weightedCount: all entries (for acceptRate denominator)
    s.weightedCount += w;
    if (entry.accepted) {
      s.weightedAccepted += w;
      s.rawCount++;  // only accepted entries count toward frequency
    }
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
  runtimePlatform?: Platform;
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
    if (process.env.LAZYBRAIN_HOOK !== '1' || process.env.LAZYBRAIN_DEBUG_HOOK === '1') {
      process.stderr.write('[LazyBrain] Secretary circuit open, skipping\n');
    }
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
    const llm = createLLMProvider({
      model: options.model,
      apiBase: options.apiBase,
      apiKey: options.apiKey,
      runtimePlatform: options.runtimePlatform,
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

    recordSuccess();
    return result;
  } catch (err) {
    recordFailure();
    if (process.env.LAZYBRAIN_HOOK !== '1' || process.env.LAZYBRAIN_DEBUG_HOOK === '1') {
      if (isCircuitOpen()) {
        process.stderr.write(`[LazyBrain] Secretary circuit open (paused ${SECRETARY_CIRCUIT_BREAKER_PAUSE_MS / 1000 / 60}min)\n`);
      } else {
        process.stderr.write(`[LazyBrain] Secretary error: ${err instanceof Error ? err.message : String(err)}\n`);
      }
    }
    return null;
  }
}
