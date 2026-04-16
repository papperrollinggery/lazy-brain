/**
 * LazyBrain — Usage Tracker
 *
 * Parses Claude Code transcript JSONL to extract token usage,
 * writes to usage.jsonl for evolution and analytics.
 *
 * Claude Code transcript format:
 * - JSONL, each line has type: "user"|"assistant"|"system"
 * - Token usage lives inside assistant entries: { type: "assistant", usage: {...}, model: "..." }
 */

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { LAZYBRAIN_DIR } from '../constants.js';

const USAGE_PATH = `${LAZYBRAIN_DIR}/usage.jsonl`;

// Token cost per 1M tokens (USD)
//
// NOTE: These tiers track Anthropic model equivalents for comparative display
// (e.g. "节省 80%" = Sonnet vs Opus baseline). Actual API calls go through
// SiliconFlow GLM models at SiliconFlow pricing. Usage costs in usage.jsonl are
// approximations using these tier labels; they are not precise billing figures.
//
// Model detection via detectModelTier():
//   - transcript contains 'opus'/'sonnet'/'haiku' → direct Anthropic tier
//   - transcript contains 'glm'                    → GLM pricing tier
//   - unknown / missing                           → sonnet (default)
export const COST_PER_1M: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  opus:   { input: 15.0,  output: 75.0,  cacheWrite: 18.75, cacheRead: 1.5 },
  sonnet: { input: 3.0,   output: 15.0,  cacheWrite: 3.75,  cacheRead: 0.30 },
  haiku:  { input: 0.80,  output: 4.0,   cacheWrite: 1.0,   cacheRead: 0.08 },
  // SiliconFlow GLM pricing (approximate, based on public rate card)
  glm:    { input: 0.07,  output: 0.07,  cacheWrite: 0.0,   cacheRead: 0.0 },
};

export interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

export interface UsageEntry {
  timestamp: string;
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  model: string;
  costUsd: number;
  taskType: string;
  agentsUsed: string[];
}

/** Detect model tier from model string */
/** Detect model tier from model string in transcript.
 * Fallback: 'unknown' → COST_PER_1M['sonnet'] (safe default).
 * Falls through to 'sonnet' for any unrecognized provider.
 */
function detectModelTier(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  if (m.includes('glm')) return 'glm';  // SiliconFlow GLM models
  return 'sonnet'; // default — avoids 'unknown' causing silent NaN in cost calc
}

/** Infer model from last assistant entry in transcript */
export function inferModel(transcriptPath: string): string {
  try {
    if (!existsSync(transcriptPath)) return 'unknown';
    const raw = readFileSync(transcriptPath, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);

    // Scan from end to find last assistant entry with model
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === 'assistant' && entry.model) return entry.model;
        if (!entry.type && entry.model) return entry.model; // fallback
      } catch {}
    }
  } catch {}
  return 'unknown';
}

/** Parse transcript JSONL and aggregate token usage.
 *
 * Claude Code transcript format: JSONL, each line:
 *   { type: "user"|"assistant"|"system", ... }
 *
 * Token usage is inside assistant entries, not top-level:
 *   { type: "assistant", usage: { input_tokens, output_tokens,
 *                                   cache_creation_input_tokens, cache_read_input_tokens }, ... }
 */
export function parseTranscript(transcriptPath: string): TokenStats {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheWriteTokens = 0;
  let cacheReadTokens = 0;

  try {
    if (!existsSync(transcriptPath)) {
      return { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens };
    }

    const raw = readFileSync(transcriptPath, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        // Only assistant entries have token usage
        if (entry.type !== 'assistant') continue;
        const usage = entry.usage ?? entry;
        if (usage.input_tokens) inputTokens += usage.input_tokens;
        if (usage.output_tokens) outputTokens += usage.output_tokens;
        if (usage.cache_creation_input_tokens) cacheWriteTokens += usage.cache_creation_input_tokens;
        if (usage.cache_read_input_tokens) cacheReadTokens += usage.cache_read_input_tokens;
      } catch {
        // Skip malformed lines
      }
    }
  } catch {}

  return { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens };
}

/** Calculate USD cost from tokens and model */
export function calculateCost(tokens: TokenStats, model: string): number {
  const tier = detectModelTier(model);
  const rates = COST_PER_1M[tier] ?? COST_PER_1M['sonnet'];
  const inputCost = (tokens.inputTokens / 1_000_000) * rates.input;
  const outputCost = (tokens.outputTokens / 1_000_000) * rates.output;
  const cacheWriteCost = (tokens.cacheWriteTokens / 1_000_000) * rates.cacheWrite;
  const cacheReadCost = (tokens.cacheReadTokens / 1_000_000) * rates.cacheRead;
  return Math.round((inputCost + outputCost + cacheWriteCost + cacheReadCost) * 1000) / 1000;
}

/** Write a usage entry to usage.jsonl */
export function writeUsageEntry(entry: UsageEntry): void {
  const line = JSON.stringify(entry);
  appendFileSync(USAGE_PATH, line + '\n');
}

/** Infer task type from transcript content (heuristic) */
export function inferTaskType(transcriptPath: string): string {
  try {
    if (!existsSync(transcriptPath)) return 'general';
    const raw = readFileSync(transcriptPath, 'utf-8').toLowerCase();

    // NOTE: CJK keywords are matched as whole substrings, not character classes.
    // "审查" is a 2-char word, not [审|查|细]. Keep CJK terms outside character classes.
    const patterns: Array<[RegExp, string]> = [
      [/(?:code.?)?review|审查/, 'code-review'],
      [/refactor|重构/, 'refactor'],
      [/test|测试/, 'testing'],
      [/deploy|部署/, 'deployment'],
      [/debug|调试|bug/, 'debugging'],
      [/build|编译/, 'build'],
      [/plan|规划/, 'planning'],
      [/research|研究/, 'research'],
      [/write|写.+?(?:code|代码|article|blog)/, 'writing'],
      [/api|接口/, 'api-design'],
      [/database|db|数据库/, 'database'],
      [/frontend|ui|前端/, 'frontend'],
      [/security|安全/, 'security'],
      [/migrat/, 'migration'],
      [/autopilot|ralph|ultrawork|ralplan|omc/, 'orchestration'],
      [/evolve|evolution/, 'evolution'],
    ];

    for (const [regex, label] of patterns) {
      if (regex.test(raw)) return label;
    }
  } catch {}
  return 'general';
}

/** Extract known agent/tool names from transcript */
export function extractAgentsUsed(transcriptPath: string): string[] {
  const found = new Set<string>();
  const KNOWN = [
    'planner', 'architect', 'critic', 'executor', 'researcher',
    'ralph', 'autopilot', 'ultrawork', 'team', 'ralplan',
    'code-reviewer', 'code-simplifier', 'debugger', 'security-reviewer',
    'test-engineer', 'writer', 'document-specialist', 'general-purpose',
    'evolve', 'evolution', 'secretary',
  ];

  try {
    if (!existsSync(transcriptPath)) return [];
    const raw = readFileSync(transcriptPath, 'utf-8').toLowerCase();
    for (const agent of KNOWN) {
      if (raw.includes(agent)) found.add(agent);
    }
  } catch {}

  return [...found];
}

/** Main entry: parse transcript → build entry → write */
export function trackSessionUsage(sessionId: string, transcriptPath: string): UsageEntry | null {
  const tokens = parseTranscript(transcriptPath);

  // Skip empty sessions
  if (tokens.inputTokens === 0 && tokens.outputTokens === 0) return null;

  const model = inferModel(transcriptPath);
  const cost = calculateCost(tokens, model);

  const entry: UsageEntry = {
    timestamp: new Date().toISOString(),
    sessionId,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    cacheWriteTokens: tokens.cacheWriteTokens,
    cacheReadTokens: tokens.cacheReadTokens,
    model,
    costUsd: cost,
    taskType: inferTaskType(transcriptPath),
    agentsUsed: extractAgentsUsed(transcriptPath),
  };

  writeUsageEntry(entry);
  return entry;
}
