#!/usr/bin/env node

/**
 * LazyBrain — Claude Code UserPromptSubmit Hook
 *
 * Reads the user's prompt from stdin, matches it against the capability graph,
 * and injects relevant skill context through hookSpecificOutput.additionalContext.
 *
 * Claude Code hook protocol:
 *   stdin:  { session_id, transcript_path, cwd, hook_event_name, prompt }
 *   stdout: { continue: true, hookSpecificOutput?: { hookEventName, additionalContext }, systemMessage?: string }
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GRAPH_PATH, CAPABILITY_MODEL_HINTS, LAZYBRAIN_DIR } from '../src/constants.js';
import { Graph } from '../src/graph/graph.js';
import { match } from '../src/matcher/matcher.js';
import { recommendTeam } from '../src/matcher/team-recommender.js';
import { detectThinkingNeed } from '../src/matcher/thinking-trigger.js';
import { loadConfig } from '../src/config/config.js';
import { askSecretary, buildHistoryHints } from '../src/secretary/secretary.js';
import { loadRecentHistory, appendHistory } from '../src/history/history.js';
import { loadProfile, isProfileStale, distillAndSave } from '../src/history/profile.js';
import { writeRecommendation } from '../src/history/tool-usage-tracker.js';
import { generateProposals } from '../src/utils/token-estimate.js';
import { detectDuplicates, buildDuplicateIndex, findCapabilityByNameOrId, compareCapabilities } from '../src/graph/duplicate-detector.js';
import { isServerRunning, getServerPort } from '../src/server/server.js';
import type { DuplicatePair } from '../src/graph/duplicate-detector.js';
import type { WikiCard, SecretaryResponse, ProposalOption } from '../src/types.js';
import type { TeamComposition } from '../src/matcher/team-recommender.js';
import { buildSessionStats } from '../src/stats/session-stats.js';
import { formatDashboard } from '../src/stats/session-dashboard.js';
import { formatDecisionCard, formatDecisionCardCompact } from '../src/hook/decision-card.js';
import { formatTeamBridgeContext } from '../src/hook/team-bridge.js';
import { loadBudgetState } from '../src/budget/state-machine.js';
import { runPreflight } from '../src/governance/preflight.js';
import { evaluatePolicy, isHeavyModeQuery, formatGovernanceInjection } from '../src/governance/policy-engine.js';
import { isMetaPrompt } from '../src/utils/meta-prompt.js';
import { beginHookRun, finishHookRun } from '../src/hook/runtime.js';
import type { HookRunRecord } from '../src/hook/types.js';

// ─── Server HTTP Client (optional fast path) ─────────────────────────────────

async function tryMatchViaServer(prompt: string): Promise<import('../src/types.js').Recommendation | null> {
  if (!isServerRunning()) return null;
  const port = getServerPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: prompt }),
      signal: AbortSignal.timeout(500),
    });
    if (!res.ok) return null;
    return await res.json() as import('../src/types.js').Recommendation;
  } catch {
    return null;
  }
}

interface EmbeddingConfig {
  apiBase: string;
  apiKey: string;
  model: string;
}

interface HookInput {
  session_id?: string;
  hook_event_name?: string;
  prompt?: string;
  cwd?: string;
  transcript_path?: string;
}

interface HookOutput {
  continue: boolean;
  additionalSystemPrompt?: string;
  runStatus?: 'ok' | 'error';
  runErrorMessage?: string;
}

interface ClaudeHookOutput {
  continue: boolean;
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext?: string;
  };
  systemMessage?: string;
}

// ─── Parchment Pet ─────────────────────────────────────────────────────────────

type ParchmentScene =
  | { type: 'hit_auto'; tool: string; score: number; secondary: Array<{ name: string; score: number }>; model?: string }
  | { type: 'hit_ask'; tool: string; score: number; secondary: Array<{ name: string; score: number }>; model?: string }
  | { type: 'thinking'; topTool: string; score: number }
  | { type: 'secretary_done'; tool: string; score: number; plan: string }
  | { type: 'secretary_dead'; code: string; fallbackTool?: string; fallbackScore?: number }
  | { type: 'timeout'; fallbackTool?: string; fallbackScore?: number }
  | { type: 'circuit_breaker' }
  | { type: 'no_match' }
  | { type: 'no_graph' }
  | { type: 'sleeping' }
  | { type: 'omc_yield'; keyword: string }
  | { type: 'new_tools'; count: number }
  | { type: 'mode_proposal'; mode: string; agents: string[]; reason: string }
  | { type: 'team_composition'; query: string; composition: TeamComposition };

const PARCHMENT_WIDTH = 36;

function cjkLen(s: string): number {
  let len = 0;
  for (const c of s) {
    const cp = c.codePointAt(0) ?? 0;
    len += (cp >= 0x1100 && cp <= 0x115F) ||
           (cp >= 0x2E80 && cp <= 0x303E) ||
           (cp >= 0x3040 && cp <= 0xA4CF) ||
           (cp >= 0xAC00 && cp <= 0xD7AF) ||
           (cp >= 0xF900 && cp <= 0xFAFF) ||
           (cp >= 0xFE10 && cp <= 0xFE1F) ||
           (cp >= 0xFE30 && cp <= 0xFE4F) ||
           (cp >= 0xFF00 && cp <= 0xFF60) ||
           (cp >= 0xFFE0 && cp <= 0xFFE6) ? 2 : 1;
  }
  return len;
}

function pad(s: string, w: number): string {
  const len = cjkLen(s);
  return s + ' '.repeat(Math.max(0, w - len));
}

function row(content: string): string {
  return `  │  ${pad(content, PARCHMENT_WIDTH)}│`;
}

function divider(): string {
  return `  ├${'─'.repeat(PARCHMENT_WIDTH + 2)}┤`;
}

function buildParchment(scene: ParchmentScene): string {
  const top = `  ╭─ 📜 LazyBrain ${'─'.repeat(PARCHMENT_WIDTH - 13)}╮`;
  const bottom = `  ╰${'─'.repeat(PARCHMENT_WIDTH + 2)}╯`;
  const lines: string[] = [top];

  switch (scene.type) {
    case 'hit_auto':
      lines.push(row('(✿owo✿)  发现武器！'));
      lines.push(divider());
      lines.push(row(`▸ /${scene.tool}  [${Math.round(scene.score * 100)}%]`));
      for (const s of scene.secondary.slice(0, 2))
        lines.push(row(`▸ /${s.name}  [${Math.round(s.score * 100)}%]`));
      if (scene.model) {
        lines.push(row(''));
        lines.push(row(`🤖 ${scene.model}`));
      }
      lines.push(bottom);
      lines.push('  [自动模式] 已注入，Claude 正在决策...');
      break;

    case 'hit_ask':
      lines.push(row('(⊙ω⊙)?  快选！快选！'));
      lines.push(divider());
      lines.push(row(`▸ /${scene.tool}  [${Math.round(scene.score * 100)}%]`));
      for (const s of scene.secondary.slice(0, 2))
        lines.push(row(`▸ /${s.name}  [${Math.round(s.score * 100)}%]`));
      lines.push(row(''));
      lines.push(row(`💬 输入 /${scene.tool} 来使用`));
      if (scene.model) {
        lines.push(row(''));
        lines.push(row(`🤖 建议: ${scene.model}`));
      }
      lines.push(bottom);
      lines.push('  [询问模式] 等待你的指令...');
      break;

    case 'thinking':
      lines.push(row('(o~o?)  嗯...想一想'));
      lines.push(divider());
      lines.push(row(`▸ /${scene.topTool}  [${Math.round(scene.score * 100)}%]`));
      lines.push(row(''));
      lines.push(row('⟳ 秘书分析中...'));
      lines.push(bottom);
      break;

    case 'secretary_done':
      lines.push(row('(✧ω✧)  秘书说话了！'));
      lines.push(divider());
      lines.push(row(`▸ /${scene.tool}  [${Math.round(scene.score * 100)}%]`));
      lines.push(row(''));
      lines.push(row(`💡 ${scene.plan.slice(0, PARCHMENT_WIDTH - 3)}`));
      lines.push(bottom);
      break;

    case 'secretary_dead':
      lines.push(row('(×_×)  秘书...挂了'));
      lines.push(divider());
      lines.push(row(`❌ API 无响应 (${scene.code})`));
      lines.push(row('💀 秘书层已阵亡'));
      if (scene.fallbackTool) {
        lines.push(row(''));
        lines.push(row(`🔄 本地: /${scene.fallbackTool} [${Math.round((scene.fallbackScore ?? 0) * 100)}%]`));
      }
      lines.push(bottom);
      break;

    case 'timeout':
      lines.push(row('(>_<)  等太久了！'));
      lines.push(divider());
      lines.push(row('⏰ 秘书超时 (>2s)'));
      if (scene.fallbackTool)
        lines.push(row(`🔄 /${scene.fallbackTool} [${Math.round((scene.fallbackScore ?? 0) * 100)}%]`));
      lines.push(bottom);
      break;

    case 'circuit_breaker':
      lines.push(row('(╥_╥)  受伤了...'));
      lines.push(divider());
      lines.push(row('🛡️  熔断器已触发'));
      lines.push(row('连续失败 3 次，休息 10 分钟'));
      lines.push(row(''));
      lines.push(row('🔄 纯本地模式运行中'));
      lines.push(bottom);
      break;

    case 'no_match':
      lines.push(row('(´-ω-`)  没找到...'));
      lines.push(divider());
      lines.push(row('🔍 未找到匹配工具'));
      lines.push(row(''));
      lines.push(row('试试: lazybrain match "..."'));
      lines.push(bottom);
      break;

    case 'no_graph':
      lines.push(row('(;ω;)  好饿...没有武器库'));
      lines.push(divider());
      lines.push(row('⚠️  还没有武器图谱'));
      lines.push(row(''));
      lines.push(row('🍖 喂食: lazybrain compile'));
      lines.push(bottom);
      break;

    case 'sleeping':
      lines.push(row('(￣ω￣)  zZZ...'));
      lines.push(divider());
      lines.push(row('💤 这条不需要工具'));
      lines.push(bottom);
      break;

    case 'omc_yield':
      lines.push(row('(・ω・)ノ  OMC 先上！'));
      lines.push(divider());
      lines.push(row(`🤝 OMC 关键词: ${scene.keyword}`));
      lines.push(row('✋ LazyBrain 让路'));
      lines.push(bottom);
      break;

    case 'new_tools':
      lines.push(row('(★ω★)  发现新武器！'));
      lines.push(divider());
      lines.push(row(`🆕 新增 ${scene.count} 个工具待编译`));
      lines.push(row(''));
      lines.push(row('运行 lazybrain compile'));
      lines.push(row('让我进化！'));
      lines.push(bottom);
      break;

    case 'mode_proposal':
      lines.push(row('(⊙‿⊙)  发现大任务！'));
      lines.push(divider());
      lines.push(row(`🎯 建议: ${scene.mode.toUpperCase()} 模式`));
      lines.push(row(`📝 ${scene.reason}`));
      for (const agent of scene.agents) {
        lines.push(row(`  • ${agent}`));
      }
      lines.push(row(''));
      lines.push(row('❓ 确认执行？输入 y 继续'));
      lines.push(bottom);
      break;

    case 'team_composition':
      lines.push(row('(⊙‿⊙)  发现大任务！'));
      lines.push(divider());
      lines.push(row('🎯 Team 组合建议'));
      lines.push(row(`基于任务: ${scene.query.slice(0, 20)}${scene.query.length > 20 ? '...' : ''}`));
      lines.push(divider());
      for (let i = 0; i < scene.composition.members.length; i++) {
        const m = scene.composition.members[i];
        lines.push(row(`${i + 1}. ${m.agent.name} (${m.category})`));
        lines.push(row(`   ${m.reason}`));
      }
      lines.push(divider());
      lines.push(row(`💡 ${scene.composition.overallReason}`));
      lines.push(row(`🔧 ${scene.composition.suggestedCommand}`));
      lines.push(row(`🚀 OMC: ${scene.composition.omcBridge.command}`));
      lines.push(bottom);
      break;
  }

  return lines.join('\n');
}

function renderParchment(scene: ParchmentScene): void {
  if (process.env.LAZYBRAIN_DEBUG_HOOK === '1') {
    process.stderr.write('\n' + buildParchment(scene) + '\n');
  }
}

function renderDecisionCard(
  prompt: string,
  top: import('../src/types.js').MatchResult,
  matches: import('../src/types.js').MatchResult[],
  threshold: number,
): void {
  const alternates = matches.slice(1, 3);
  const visible = top.score >= threshold
    ? formatDecisionCard({
        query: prompt,
        topMatch: top,
        alternates,
        lookupSavings: Math.max(1, matches.length),
      })
    : formatDecisionCardCompact(
        top.capability.name,
        top.score,
        alternates.map(m => ({ name: m.capability.name, score: m.score })),
      );
  _visibleNotice = visible;
}

function buildDuplicateWarning(
  capId: string,
  capName: string,
  dupIndex: Map<string, DuplicatePair[]>,
): string {
  const pairs = dupIndex.get(capId);
  if (!pairs || pairs.length === 0) return '';

  const lines: string[] = [];
  lines.push('');
  lines.push('## ⚠ 检测到同类工具');
  lines.push('');
  lines.push(`**${capName}** 被推荐，但系统里还装了类似工具：`);

  for (const pair of pairs) {
    const other = pair.a.id === capId ? pair.b : pair.a;
    lines.push(`- **${other.name}**（来自 ${other.origin}）— ${pair.reason}`);
  }

  lines.push('');
  lines.push('> 建议：');
  lines.push('> - 如果确定用 ' + capName + '：忽略');
  lines.push('> - 如果不确定：`lazybrain compare <a> <b>`');
  lines.push('');
  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

function safeWriteRecommendation(entry: Parameters<typeof writeRecommendation>[0]): void {
  try {
    writeRecommendation(entry);
  } catch (err) {
    if (process.env.LAZYBRAIN_DEBUG_HOOK === '1') {
      process.stderr.write(`[LazyBrain] Recommendation tracking error: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}

// Module-level hook state used when formatting official Claude Code hook output.
let _transcriptPath = '';
let _hookEventName = '';
let _visibleNotice = '';
let _currentRun: HookRunRecord | null = null;
let _currentRunStartedAt = 0;
let _hookConfig: ReturnType<typeof loadConfig> | null = null;

async function main() {
  process.env.LAZYBRAIN_HOOK = '1';
  let input: HookInput = {};

  try {
    const raw = readFileSync('/dev/stdin', 'utf-8').trim();
    if (raw) input = JSON.parse(raw) as HookInput;
    _transcriptPath = input.transcript_path ?? '';
    _hookEventName = input.hook_event_name ?? '';
  } catch {
    output({ continue: true });
    return;
  }

  // ─── Stop Hook: legacy compatibility only ─────────────────────────────
  if (input.hook_event_name === 'Stop') {
    output({ continue: true });
    return;
  }

  const config = loadConfig();
  _hookConfig = config;
  const runDecision = beginHookRun({
    cwd: input.cwd,
    hookEventName: input.hook_event_name ?? 'UserPromptSubmit',
    sessionId: input.session_id,
    prompt: input.prompt,
  }, { config });
  if (!runDecision.allowed) {
    output({ continue: true });
    return;
  }
  _currentRun = runDecision.run;
  _currentRunStartedAt = Date.now();

  // ─── SessionStart Hook: Dashboard ──────────────────────────────────────
  if (input.hook_event_name === 'SessionStart') {
    try {
      if (existsSync(GRAPH_PATH)) {
        const graph = Graph.load(GRAPH_PATH);
        const dupPairs = detectDuplicates(graph);
        const stats = buildSessionStats(graph, dupPairs);
        const dashboard = formatDashboard(stats);
        output({ continue: true, additionalSystemPrompt: dashboard });
        return;
      }
    } catch {}
    output({ continue: true });
    return;
  }

  const prompt = input.prompt?.trim();
  if (!prompt || prompt.length < 3) {
    output({ continue: true });
    return;
  }

  // ─── Meta / Operator Prompt Bypass ─────────────────────────────────────
  // Control/meta prompts should not be routed through LazyBrain machinery.
  // Detect before match() so we skip all computation.
  if (isMetaPrompt(prompt)) {
    // Bypass: no match, no decision card, no governance, no secretary, no last-match write
    appendHistory({
      timestamp: new Date().toISOString(),
      query: prompt,
      matched: '',
      accepted: false,
      layer: 'tag',
      sessionId: process.env.CLAUDE_SESSION_ID ?? 'unknown',
      reason: 'meta_bypass',
    });
    output({ continue: true });
    return;
  }

  // no_graph 场景 — 先 loadConfig 再判断
  if (!existsSync(GRAPH_PATH)) {
    if (config.mode === 'ask') {
      renderParchment({ type: 'no_graph' });
    }
    _visibleNotice = 'LazyBrain: 未找到武器图谱，请先运行 `lazybrain scan && lazybrain compile`。';
    appendHistory({
      timestamp: new Date().toISOString(),
      query: prompt,
      matched: '',
      accepted: false,
      layer: 'tag',
      sessionId: process.env.CLAUDE_SESSION_ID ?? 'unknown',
      reason: 'no_graph',
    });
    writeLastMatch(null, 0);
    output({ continue: true });
    return;
  }

  try {
    const graph = Graph.load(GRAPH_PATH);

    const dupIndex = buildDuplicateIndex(detectDuplicates(graph));

    const history = loadRecentHistory(50);
    let profile: import('../src/types.js').UserProfile | undefined = undefined;
    try { profile = loadProfile() ?? undefined; } catch {}

    // ─── Team Composition Detection ─────────────────────────────────────────
    const TEAM_KEYWORDS = ['/team', 'team模式', '组队', '多 agent', 'multi-agent', '多agent'];
    const isTeamQuery = TEAM_KEYWORDS.some(kw => prompt.toLowerCase().includes(kw.toLowerCase()));

    const teamComposition = isTeamQuery ? recommendTeam(prompt, graph, 5) : null;

    if (isTeamQuery && config.mode === 'ask') {
      if (teamComposition && teamComposition.members.length > 0) {
        renderParchment({ type: 'team_composition', query: prompt, composition: teamComposition });
      }
    }

    const result = await match(prompt, { graph, config, history, profile });

    const thinkingHint = detectThinkingNeed(prompt);

    if (result.matches.length === 0) {
      if (config.mode === 'ask') renderParchment({ type: 'no_match' });
      writeLastMatch(null, 0);
      const bridgeNoMatch = appendTeamBridge('', prompt, teamComposition);
      const govNoMatch = appendGovernance(bridgeNoMatch, prompt, result, teamComposition);
      output({
        continue: true,
        additionalSystemPrompt: govNoMatch.trim() || undefined,
      });
      return;
    }

    const top = result.matches[0];
    const allNodes = graph.getAllNodes();

    // ─── Layer 0/1: High confidence (>= 0.85) — inject wiki card directly ───
    if (top.score >= 0.85) {
      const secondary = result.matches.slice(1, 3)
        .filter(m => m.score >= top.score * 0.8)
        .map(m => ({ name: m.capability.name, score: m.score }));

      if (config.mode === 'ask') {
        const modelHint = CAPABILITY_MODEL_HINTS[top.capability.name];
        renderParchment({ type: 'hit_ask', tool: top.capability.name, score: top.score, secondary, model: modelHint });
      } else if (config.mode === 'auto') {
        const modelHint = CAPABILITY_MODEL_HINTS[top.capability.name];
        renderParchment({ type: 'hit_auto', tool: top.capability.name, score: top.score, secondary, model: modelHint });
      }
      renderDecisionCard(prompt, top, result.matches, config.decisionCardThreshold ?? 0.7);

      const card = graph.getWikiCard(top.capability.id);
      const histStats = getHistoryStats(history ?? [], top.capability.name, top.capability.id);
      // 'optimal': show proposals with auto-recommend (cheapest picked)
      // 'ask': show all proposals, no auto-recommend tag
      const allProposals = generateProposals(prompt, top.score);
      const proposals = config.strategy === 'always-main'
        ? undefined
        : config.strategy === 'optimal'
          ? allProposals
          : allProposals; // 'ask' shows all, no recommend tag
      const text = card
        ? formatWikiCard(card, top.score, secondary, { historyCount: histStats.count || undefined, historyAcceptRate: histStats.count > 0 ? histStats.acceptRate : undefined, nextSteps: result.nextSteps, proposals, strategy: config.strategy, decisionHint: result.decisionHint }, config.mode === 'ask')
        : formatFallback(top, secondary, result.nextSteps, undefined, undefined, result.decisionHint, config.mode === 'ask');

      appendHistory({
        timestamp: new Date().toISOString(),
        query: prompt,
        matched: top.capability.name,
        id: top.capability.id,
        accepted: true,
        layer: top.layer,
        sessionId: process.env.CLAUDE_SESSION_ID ?? 'unknown',
        candidateList: result.matches.slice(0, 3).map(m => m.capability.name),
        reason: 'matched',
      });

      writeLastMatch(top.capability.name, top.score, top.historyBoost);
      const dupWarning1 = buildDuplicateWarning(top.capability.id, top.capability.name, dupIndex);
      const finalText1Base = dupWarning1 ? prependThinkingHint(text, thinkingHint) + dupWarning1 : prependThinkingHint(text, thinkingHint);
      const finalText1 = appendTeamBridge(finalText1Base, prompt, teamComposition);
      const recTools = [top.capability.name, ...secondary.map(s => s.name)];
      safeWriteRecommendation({ sessionId: input.session_id ?? process.env.CLAUDE_SESSION_ID ?? 'unknown', timestamp: new Date().toISOString(), query: prompt, recommended: recTools });
      const govText1 = appendGovernance(finalText1, prompt, result, teamComposition);
      output({ continue: true, additionalSystemPrompt: govText1 });
      return;
    }

    // ─── Low confidence (< 0.4) and no API — skip injection ───
    if (top.score < 0.4 && !(config.compileApiBase && config.compileApiKey)) {
      if (config.mode === 'ask') renderParchment({ type: 'sleeping' });
      appendHistory({
        timestamp: new Date().toISOString(),
        query: prompt,
        matched: top.capability.name,
        id: top.capability.id,
        accepted: false,
        layer: top.layer,
        sessionId: process.env.CLAUDE_SESSION_ID ?? 'unknown',
        reason: 'low_score',
      });
      writeLastMatch(top.capability.name, top.score, top.historyBoost);
      const bridgeLow = appendTeamBridge('', prompt, teamComposition);
      const govLow = appendGovernance(bridgeLow, prompt, result, teamComposition);
      output({
        continue: true,
        additionalSystemPrompt: govLow.trim() || undefined,
      });
      return;
    }

    // ─── Low confidence (< 0.4) with API — try Secretary below, log if it rejects ───

    // ─── Layer 2: Secretary (score 0.4-0.85, or <0.4 with API) ───
    const secretaryApiBase = config.secretaryApiBase ?? config.compileApiBase;
    const secretaryApiKey = config.secretaryApiKey ?? config.compileApiKey;
    // Warn if base is set but key is missing — otherwise Secretary silently skipped
    if (secretaryApiBase && !secretaryApiKey) {
      if (process.env.LAZYBRAIN_DEBUG_HOOK === '1') {
        process.stderr.write('[LazyBrain] WARNING: secretaryApiBase configured but secretaryApiKey missing. Secretary layer disabled.\n');
      }
    }
    if (secretaryApiBase && secretaryApiKey) {
      if (config.mode === 'ask') {
        renderParchment({ type: 'thinking', topTool: top.capability.name, score: top.score });
      }

      const localMatches = result.matches.map(m => m.capability);
      const matchIds = new Set(localMatches.map(m => m.id));
      const remaining = allNodes
        .filter(n => !matchIds.has(n.id))
        .filter(n => n.tier === undefined || n.tier <= 1);
      const candidates = [...localMatches, ...remaining];

      const historyHints = buildHistoryHints(history ?? []);

      // 加载用户画像（过期时自动蒸馏）
      let profile = loadProfile();
      if (isProfileStale() && history && history.length > 0) {
        try { profile = distillAndSave(history); } catch {}
      }

      const secretaryResult = await askSecretary(prompt, candidates, {
        apiBase: config.secretaryApiBase ?? config.compileApiBase ?? '',
        apiKey: config.secretaryApiKey ?? config.compileApiKey ?? '',
        model: config.secretaryModel ?? 'Qwen/Qwen2.5-7B-Instruct',
        runtimePlatform: config.platform,
        historyHints,
        profile,
      });

      if (secretaryResult) {
        // Secretary 判断不需要工具 → 不注入
        if (!secretaryResult.needsTool) {
          if (config.mode === 'ask') {
            renderParchment({ type: 'sleeping' });
          }
          appendHistory({
            timestamp: new Date().toISOString(),
            query: prompt,
            matched: '',
            accepted: false,
            layer: 'llm',
            sessionId: process.env.CLAUDE_SESSION_ID ?? 'unknown',
            reason: 'secretary_no_tool',
          });
          writeLastMatch(null, 0);
          const bridgeSecNoTool = appendTeamBridge('', prompt, teamComposition);
          const govSecNoTool = appendGovernance(bridgeSecNoTool, prompt, result, teamComposition);
          output({
            continue: true,
            additionalSystemPrompt: govSecNoTool.trim() || undefined,
          });
          return;
        }

        const primaryAction = secretaryResult.tasks[0]?.action;

        // Mode proposal: 非 regular 模式显示提案 UI
        if (secretaryResult.mode && secretaryResult.mode !== 'regular' && config.mode === 'ask') {
          const agents = secretaryResult.tasks.map(t => `${t.action}(${t.model ?? 'sonnet'})`).slice(0, 4);
          renderParchment({
            type: 'mode_proposal',
            mode: secretaryResult.mode,
            reason: secretaryResult.modeReason ?? `推荐 ${secretaryResult.mode} 模式执行`,
            agents,
          });
        }

        if (config.mode === 'ask' && primaryAction) {
          renderParchment({ type: 'secretary_done', tool: primaryAction, score: secretaryResult.confidence, plan: secretaryResult.plan });
        }

        const primaryNode = primaryAction ? graph.findByName(primaryAction) : null;
        if (primaryNode) {
          const text = formatSecretaryInjection(secretaryResult, graph, history ?? [], result.nextSteps, result.decisionHint, config.mode === 'ask');

          appendHistory({
            timestamp: new Date().toISOString(),
            query: prompt,
            matched: primaryAction!,
            id: primaryNode.id,
            accepted: true,
            layer: 'llm',
            sessionId: process.env.CLAUDE_SESSION_ID ?? 'unknown',
            candidateList: secretaryResult.tasks.slice(0, 3).map(t => t.action),
            reason: 'matched',
          });

          writeLastMatch(primaryAction!, secretaryResult.confidence);
          const dupWarning2 = buildDuplicateWarning(primaryNode.id, primaryAction!, dupIndex);
          const finalText2Base = dupWarning2 ? prependThinkingHint(text, thinkingHint) + dupWarning2 : prependThinkingHint(text, thinkingHint);
          const finalText2 = appendTeamBridge(finalText2Base, prompt, teamComposition);
          const secretaryTools = [primaryAction!, ...secretaryResult.tasks.slice(1, 3).map(t => t.action)];
          safeWriteRecommendation({ sessionId: input.session_id ?? process.env.CLAUDE_SESSION_ID ?? 'unknown', timestamp: new Date().toISOString(), query: prompt, recommended: secretaryTools });
          const govText2 = appendGovernance(finalText2, prompt, result, teamComposition);
          output({ continue: true, additionalSystemPrompt: govText2 });
          return;
        }

        // Secretary 推荐了工具但图中找不到 → 记录为拒绝
        appendHistory({
          timestamp: new Date().toISOString(),
          query: prompt,
          matched: primaryAction ?? '',
          accepted: false,
          layer: 'llm',
          sessionId: process.env.CLAUDE_SESSION_ID ?? 'unknown',
          reason: 'secretary_rejected',
        });
        writeLastMatch(primaryAction ?? null, secretaryResult.confidence);
        const bridgeSecRej = appendTeamBridge('', prompt, teamComposition);
        const govSecRej = appendGovernance(bridgeSecRej, prompt, result, teamComposition);
        output({
          continue: true,
          additionalSystemPrompt: govSecRej.trim() || undefined,
        });
        return;
      } else {
        // Secretary failed (network/parse error) — mark fallback as accepted=false
        // so distillProfile acceptRate isn't inflated by failed Secretary sessions
        if (config.mode === 'ask') {
          renderParchment({ type: 'secretary_dead', code: 'network', fallbackTool: top.capability.name, fallbackScore: top.score });
        }
      }
    }

    // ─── Fallback: local result (score 0.4-0.85, secretary failed or skipped) ───
    if (top.score >= 0.4) {
      const secondary = result.matches.slice(1, 3)
        .filter(m => m.score >= top.score * 0.8)
        .map(m => ({ name: m.capability.name, score: m.score }));

      const card = graph.getWikiCard(top.capability.id);
      const histStats2 = getHistoryStats(history ?? [], top.capability.name, top.capability.id);
      const proposals2 = config.strategy !== 'always-main'
        ? generateProposals(prompt, top.score)
        : undefined;
      const text = card
        ? formatWikiCard(card, top.score, secondary, histStats2.count > 0 ? { historyCount: histStats2.count, historyAcceptRate: histStats2.acceptRate, nextSteps: result.nextSteps, proposals: proposals2, strategy: config.strategy, decisionHint: result.decisionHint } : { nextSteps: result.nextSteps, proposals: proposals2, strategy: config.strategy, decisionHint: result.decisionHint }, config.mode === 'ask')
        : formatFallback(top, secondary, result.nextSteps, proposals2, config.strategy, result.decisionHint, config.mode === 'ask');
      renderDecisionCard(prompt, top, result.matches, config.decisionCardThreshold ?? 0.7);

      // Fallback path: Secretary failed or skipped, using local result.
      // accepted=false so acceptRate isn't inflated by Secretary failures.
      appendHistory({
        timestamp: new Date().toISOString(),
        query: prompt,
        matched: top.capability.name,
        id: top.capability.id,
        accepted: false,
        layer: top.layer,
        sessionId: process.env.CLAUDE_SESSION_ID ?? 'unknown',
        candidateList: result.matches.slice(0, 3).map(m => m.capability.name),
        reason: 'secretary_fallback',
      });

      writeLastMatch(top.capability.name, top.score, top.historyBoost);
      const dupWarning3 = buildDuplicateWarning(top.capability.id, top.capability.name, dupIndex);
      const finalText3Base = dupWarning3 ? prependThinkingHint(text, thinkingHint) + dupWarning3 : prependThinkingHint(text, thinkingHint);
      const finalText3 = appendTeamBridge(finalText3Base, prompt, teamComposition);
      const fallbackTools = [top.capability.name, ...secondary.map(s => s.name)];
      safeWriteRecommendation({ sessionId: input.session_id ?? process.env.CLAUDE_SESSION_ID ?? 'unknown', timestamp: new Date().toISOString(), query: prompt, recommended: fallbackTools });
      const govText3 = appendGovernance(finalText3, prompt, result, teamComposition);
      output({ continue: true, additionalSystemPrompt: govText3 });
      return;
    }

    // ─── 最终无匹配（所有路径都过了，分数仍不够） ───
    if (config.mode === 'ask') renderParchment({ type: 'sleeping' });
    appendHistory({
      timestamp: new Date().toISOString(),
      query: prompt,
      matched: top.capability.name,
      id: top.capability.id,
      accepted: false,
      layer: top.layer,
      sessionId: process.env.CLAUDE_SESSION_ID ?? 'unknown',
      reason: 'no_match',
    });
    writeLastMatch(null, 0);
    const bridgeFinal = appendTeamBridge('', prompt, teamComposition);
    const govFinal = appendGovernance(bridgeFinal, prompt, result, teamComposition);
    output({
      continue: true,
      additionalSystemPrompt: govFinal.trim() || undefined,
    });
  } catch (err: unknown) {
    const code = (err as { status?: number })?.status ?? 'ERR';
    const config = loadConfig();
    if (process.env.LAZYBRAIN_DEBUG_HOOK === '1') {
      process.stderr.write(`[LazyBrain] Hook error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    }
    if (config.mode === 'ask') {
      renderParchment({ type: 'secretary_dead', code: String(code) });
    }
    // 在 catch 中 top 可能未定义，只记录 query 和 error 信号
    appendHistory({
      timestamp: new Date().toISOString(),
      query: typeof prompt !== 'undefined' ? prompt : '',
      matched: '',
      accepted: false,
      layer: 'tag',
      sessionId: process.env.CLAUDE_SESSION_ID ?? 'unknown',
      reason: 'error',
    });
    writeLastMatch(null, 0);
    output({
      continue: true,
      runStatus: 'error',
      runErrorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}

function output(data: HookOutput) {
  if (_currentRun) {
    finishHookRun(_currentRun, {
      status: data.runStatus ?? 'ok',
      durationMs: Math.max(1, Date.now() - _currentRunStartedAt),
      errorMessage: data.runErrorMessage,
    }, { config: _hookConfig ?? undefined });
    _currentRun = null;
    _currentRunStartedAt = 0;
  }

  const hookEventName = _hookEventName || 'UserPromptSubmit';
  const payload: ClaudeHookOutput = { continue: data.continue };

  if (data.additionalSystemPrompt) {
    payload.hookSpecificOutput = {
      hookEventName,
      additionalContext: data.additionalSystemPrompt,
    };
  }

  if (_visibleNotice) {
    payload.systemMessage = _visibleNotice;
  }

  _visibleNotice = '';
  _hookConfig = null;

  process.stdout.write(JSON.stringify(payload) + '\n');
}

function getHistoryStats(history: import('../src/types.js').HistoryEntry[], capName: string, capId?: string): { count: number; acceptRate: number } {
  const entries = history.filter(h => h.id === capId || h.matched === capName);
  if (entries.length === 0) return { count: 0, acceptRate: 0 };
  const accepted = entries.filter(h => h.accepted).length;
  return { count: entries.length, acceptRate: accepted / entries.length };
}

function writeLastMatch(tool: string | null, score: number, historyBoost?: number): void {
  const config = loadConfig();
  try {
    writeFileSync(join(LAZYBRAIN_DIR, 'last-match.json'), JSON.stringify({
      tool,
      score,
      historyBoost: historyBoost ?? 0,
      model: config.compileModel ?? 'unknown',
      updatedAt: Date.now(),
    }));
  } catch {}
}

function renderDecisionHint(
  hint: { type: string; reason: string; suggestedTools: string[]; note: string },
): string[] {
  const lines: string[] = [];
  lines.push(`## 🧠 决策类型：${hint.type}`);
  lines.push('');
  lines.push(hint.reason);
  lines.push('');
  lines.push('**建议考虑的工具组合**：');
  for (const tool of hint.suggestedTools.slice(0, 4)) {
    lines.push(`- /${tool}`);
  }
  lines.push('');
  lines.push(`> ${hint.note}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines;
}

function renderThinkingHintBlock(
  reason: string,
  skills: Array<{ name: string; why: string }>,
): string[] {
  const lines: string[] = [];
  lines.push('## 💭 思考工具提醒');
  lines.push('');
  lines.push(reason);
  lines.push('');
  for (const s of skills.slice(0, 2)) {
    lines.push(`- **${s.name}** — ${s.why}`);
  }
  lines.push('');
  lines.push('> 主模型直接决策可能遗漏角度。建议先用思考工具理清。');
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines;
}

function prependThinkingHint(text: string, hint?: { triggered: boolean; reason: string; suggestedSkills: Array<{ name: string; why: string }> }): string {
  if (!hint?.triggered) return text;
  const block = renderThinkingHintBlock(hint.reason, hint.suggestedSkills);
  return block.join('\n') + text;
}

function appendTeamBridge(
  text: string,
  query: string,
  composition: TeamComposition | null,
): string {
  if (!composition || composition.members.length === 0) return text;
  return text + '\n\n' + formatTeamBridgeContext(query, composition);
}

/**
 * Append governance preflight injection for heavy-mode queries.
 * Non-invasive: only injects context when heavy mode is detected and preflight is enabled.
 */
function appendGovernance(
  text: string,
  query: string,
  recommendation: import('../src/types.js').Recommendation | null,
  teamComposition: TeamComposition | null,
): string {
  const config = loadConfig();
  if (!isHeavyModeQuery(query)) return text;
  if (!config.governance?.enablePreflight) return text;

  const budgetState = loadBudgetState();
  if (!budgetState) return text;

  const decision = runPreflight({ query, recommendation, teamComposition, budgetState, config });
  const policyResult = evaluatePolicy(decision, budgetState, config);
  const injection = formatGovernanceInjection(decision, policyResult);
  if (!injection) return text;
  return text + '\n\n' + injection;
}

function formatSecretaryInjection(
  resp: SecretaryResponse,
  graph: import('../src/graph/graph.js').Graph,
  history: import('../src/types.js').HistoryEntry[],
  nextSteps?: string[],
  decisionHint?: { type: string; reason: string; suggestedTools: string[]; note: string },
  compact = false,
): string {
  if (compact) {
    const topTool = resp.tasks[0]?.action ?? '';
    const topScore = resp.confidence;
    const secondary = resp.tasks.slice(1, 3).map(t => ({ name: t.action, score: resp.confidence - 0.05 }));
    return formatCompactRecommendation(topTool, topScore, secondary, decisionHint);
  }
  const lines: string[] = [];

  if (decisionHint) {
    lines.push(...renderDecisionHint(decisionHint));
  }

  // Intent
  lines.push(`**意图**: ${resp.intent}`);

  // Mode proposal (non-regular)
  if (resp.mode && resp.mode !== 'regular') {
    lines.push('');
    lines.push(`**推荐模式**: ${resp.mode.toUpperCase()} — ${resp.modeReason ?? ''}`);
    lines.push('');
    lines.push('| 步骤 | 工具 | 模型 | 说明 |');
    lines.push('|------|------|------|------|');
    for (const t of resp.tasks.slice(0, 4)) {
      lines.push(`| ${resp.tasks.indexOf(t) + 1} | /${t.action} | ${t.model ?? 'sonnet'} | ${t.reason} |`);
    }
  }

  // Top tools
  lines.push('');
  lines.push('**推荐工具**');
  lines.push('');
  lines.push('| 工具 | 置信度 | 说明 |');
  lines.push('|------|--------|------|');
  for (let i = 0; i < resp.tasks.length; i++) {
    const t = resp.tasks[i];
    const pct = Math.round((resp.confidence - i * 0.05) * 100);
    lines.push(`| /${t.action} | ${Math.max(pct, 60)}% | ${t.reason.slice(0, 40)} |`);
  }

  // Reasoning
  if (resp.reasoning) {
    lines.push('');
    lines.push(`**分析**: ${resp.reasoning}`);
  }

  // Next steps
  if (nextSteps && nextSteps.length > 0) {
    lines.push('');
    lines.push(`**下一步**: ${nextSteps.map(s => `/${s}`).join(' → ')}`);
  }

  // Recommendation
  lines.push('');
  if (resp.tasks.length > 0) {
    const primaryStats = getHistoryStats(history, resp.tasks[0].action);
    const histLine = primaryStats.count > 0
      ? `（历史使用 ${primaryStats.count} 次，接受率 ${Math.round(primaryStats.acceptRate * 100)}%，来源: history.jsonl）`
      : '';
    lines.push(`> 使用 /${resp.tasks[0].action} ${histLine}`);
  }

  lines.push('');
  lines.push('> **说明**: 置信度 = tag 匹配分 + 历史加权；估算 tokens = prompt 估算，仅供参考。');

  return lines.join('\n');
}

function formatCompactRecommendation(
  topTool: string,
  topScore: number,
  secondary: Array<{ name: string; score: number }>,
  decisionHint?: { type: string },
): string {
  const parts: string[] = [];
  parts.push(`🧠 LazyBrain: /${topTool} (${Math.round(topScore * 100)}%)`);
  if (secondary.length > 0) {
    const secondaryStr = secondary.slice(0, 2)
      .map(s => `/${s.name} (${Math.round(s.score * 100)}%)`)
      .join(', ');
    parts.push(secondaryStr);
  }
  if (decisionHint?.type) {
    parts.push(`[${decisionHint.type} 决策]`);
  }
  return parts.join(' · ');
}

function formatFallback(
  top: { capability: { kind: string; name: string; scenario?: string }; score: number },
  secondary: Array<{ name: string; score: number }>,
  nextSteps?: string[],
  proposals?: ProposalOption[],
  strategy?: string,
  decisionHint?: { type: string; reason: string; suggestedTools: string[]; note: string },
  compact = false,
): string {
  if (compact) {
    return formatCompactRecommendation(top.capability.name, top.score, secondary, decisionHint);
  }
  const pct = Math.round(top.score * 100);
  const lines: string[] = [];

  if (decisionHint) {
    lines.push(...renderDecisionHint(decisionHint));
  }

  lines.push(`**LazyBrain 推荐**`);
  lines.push('');
  lines.push('| 工具 | 置信度 |');
  lines.push('|------|--------|');
  lines.push(`| /${top.capability.name} | ${pct}% |`);
  for (const s of secondary.slice(0, 2)) {
    lines.push(`| /${s.name} | ${Math.round(s.score * 100)}% |`);
  }

  if (top.capability.scenario) {
    lines.push('');
    lines.push(`**适用场景**: ${top.capability.scenario}`);
  }

  if (nextSteps && nextSteps.length > 0) {
    lines.push('');
    lines.push(`**下一步**: ${nextSteps.map(s => `/${s}`).join(' → ')}`);
  }

  if (proposals && proposals.length > 0) {
    lines.push('');
    lines.push('**执行方案**');
    lines.push('');
    lines.push('| 方案 | 模型 | 估算 tokens |');
    lines.push('|------|------|------------|');
    for (const p of proposals) {
      const tokenLabel = p.estimatedTokens >= 1000
        ? `${(p.estimatedTokens / 1000).toFixed(1)}k`
        : `${p.estimatedTokens}`;
      lines.push(`| ${p.label} | ${p.model} | ~${tokenLabel} |`);
    }
  }

  lines.push('');
  lines.push('> **说明**: 置信度 = tag 匹配分 + 历史加权；估算 tokens = prompt 估算，仅供参考。');

  return lines.join('\n');
}

function formatWikiCard(
  card: WikiCard,
  score: number,
  secondaryMatches: Array<{ name: string; score: number }>,
  opts?: { reasoning?: string; historyCount?: number; historyAcceptRate?: number; secretaryPlan?: string; nextSteps?: string[]; proposals?: ProposalOption[]; strategy?: string; decisionHint?: { type: string; reason: string; suggestedTools: string[]; note: string } },
  compact = false,
): string {
  if (compact) {
    return formatCompactRecommendation(card.capability.name, score, secondaryMatches, opts?.decisionHint);
  }
  const cap = card.capability;
  const pct = Math.round(score * 100);
  const lines: string[] = [];

  if (opts?.decisionHint) {
    lines.push(...renderDecisionHint(opts.decisionHint));
  }

  // Header
  lines.push('**LazyBrain 推荐**');
  lines.push('');

  // Tool table: top + secondary
  lines.push('| 工具 | 置信度 | 说明 |');
  lines.push('|------|--------|------|');
  lines.push(`| /${cap.name} | ${pct}% | ${cap.scenario ?? cap.description.slice(0, 40)} |`);
  for (const m of secondaryMatches.slice(0, 2)) {
    lines.push(`| /${m.name} | ${Math.round(m.score * 100)}% | — |`);
  }

  // Composes / depends
  const contextLines: string[] = [];
  if (card.composesWith.length > 0) {
    const combos = card.composesWith.slice(0, 2)
      .map(c => `/${cap.name} + /${c.capability.name}`)
      .join(', ');
    contextLines.push(`**推荐组合**: ${combos}`);
  }
  if (card.dependsOn.length > 0) {
    const deps = card.dependsOn.slice(0, 2).map(d => `/${d.capability.name}`).join(', ');
    contextLines.push(`**前置条件**: ${deps}`);
  }

  // History stats
  if (opts?.historyCount && opts.historyCount > 0) {
    const histLine = opts.historyAcceptRate !== undefined
      ? `历史使用 ${opts.historyCount} 次，接受率 ${Math.round(opts.historyAcceptRate * 100)}%`
      : `历史使用 ${opts.historyCount} 次`;
    contextLines.push(`**历史**（来自 history.jsonl）: ${histLine}`);
  }

  // Next steps
  if (opts?.nextSteps && opts.nextSteps.length > 0) {
    contextLines.push(`**下一步**: ${opts.nextSteps.map(s => `/${s}`).join(' → ')}`);
  }

  if (contextLines.length > 0) {
    lines.push('');
    lines.push(...contextLines);
  }

  // Similar tools (if any, not already in table)
  const similar = card.similarTo.slice(0, 2);
  if (similar.length > 0) {
    lines.push('');
    lines.push('**相近工具**');
    lines.push('');
    lines.push('| 工具 | 差异 |');
    lines.push('|------|------|');
    for (const c of similar) {
      lines.push(`| /${c.capability.name} | ${c.diff ?? '—'} |`);
    }
  }

  // Execution proposals
  if (opts?.proposals && opts.proposals.length > 0) {
    lines.push('');
    lines.push('**执行方案**');
    lines.push('');
    lines.push('| 方案 | 模型 | 估算 tokens |');
    lines.push('|------|------|------------|');
    for (const p of opts.proposals) {
      const tokenLabel = p.estimatedTokens >= 1000
        ? `${(p.estimatedTokens / 1000).toFixed(1)}k`
        : `${p.estimatedTokens}`;
      lines.push(`| ${p.label} | ${p.model} | ~${tokenLabel} |`);
    }
    if (opts.proposals.length > 1 && opts.strategy !== 'ask') {
      const best = opts.proposals.reduce((a, b) => a.estimatedTokens < b.estimatedTokens ? a : b);
      lines.push('');
      lines.push(`> 推荐: ${best.label}（~${best.estimatedTokens} tokens）`);
    }
  }

  lines.push('');
  lines.push('> **说明**: 置信度 = tag 匹配分 + 历史加权；估算 tokens = prompt 估算，仅供参考。');

  return lines.join('\n');
}

main().catch((err) => {
  if (_currentRun) {
    finishHookRun(_currentRun, {
      status: 'error',
      durationMs: Math.max(1, Date.now() - _currentRunStartedAt),
      errorMessage: err instanceof Error ? err.message : String(err),
    }, { config: _hookConfig ?? undefined });
    _currentRun = null;
    _currentRunStartedAt = 0;
  }
  console.error(err);
  process.exit(1);
});
