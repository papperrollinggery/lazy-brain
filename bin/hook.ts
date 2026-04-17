#!/usr/bin/env node

/**
 * LazyBrain — Claude Code UserPromptSubmit Hook
 *
 * Reads the user's prompt from stdin, matches it against the capability graph,
 * and injects relevant skill context as additionalSystemPrompt.
 *
 * Claude Code hook protocol:
 *   stdin:  { session_id, transcript_path, cwd, hook_event_name, prompt }
 *   stdout: { continue: true, additionalSystemPrompt?: string }
 */

import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { GRAPH_PATH, CAPABILITY_MODEL_HINTS, LAZYBRAIN_DIR, HOOK_ACTIVE_PATH } from '../src/constants.js';
import { Graph } from '../src/graph/graph.js';
import { match } from '../src/matcher/matcher.js';
import { loadConfig } from '../src/config/config.js';
import { askSecretary, buildHistoryHints } from '../src/secretary/secretary.js';
import { loadRecentHistory, appendHistory } from '../src/history/history.js';
import { loadProfile, isProfileStale, distillAndSave } from '../src/history/profile.js';
import { trackSessionUsage } from '../src/history/usage.js';
import { evolveCapabilities } from '../src/evolution/evolve.js';
import { generateProposals } from '../src/utils/token-estimate.js';
import type { WikiCard, SecretaryResponse, ProposalOption } from '../src/types.js';

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
}

interface HookOutput {
  continue: boolean;
  additionalSystemPrompt?: string;
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
  | { type: 'mode_proposal'; mode: string; agents: string[]; reason: string };

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
  }

  return lines.join('\n');
}

function renderParchment(scene: ParchmentScene): void {
  process.stderr.write('\n' + buildParchment(scene) + '\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function cleanupPid(): void {
  try { if (existsSync(HOOK_ACTIVE_PATH)) unlinkSync(HOOK_ACTIVE_PATH); } catch {}
}

async function main() {
  let input: HookInput = {};
  // Signal statusline that LazyBrain is processing
  try {
    writeFileSync(HOOK_ACTIVE_PATH, String(process.pid), 'utf-8');
  } catch {}

  try {
    const raw = readFileSync('/dev/stdin', 'utf-8').trim();
    if (raw) input = JSON.parse(raw) as HookInput;
  } catch {
    cleanupPid();
    output({ continue: true });
    return;
  }

  // ─── Stop Hook: Token tracking + evolution ─────────────────────────────
  if (input.hook_event_name === 'Stop') {
    const sessionId = input.session_id ?? 'unknown';
    const transcriptPath = (input as Record<string, unknown>)['transcript_path'] as string ?? '';

    // Track token usage for this session
    if (transcriptPath) {
      try {
        const entry = trackSessionUsage(sessionId, transcriptPath);
        if (entry) {
          // Trigger evolution based on new usage data — evolution errors are non-fatal
          try {
            evolveCapabilities({ auto: true });
          } catch (evolutionError) {
            process.stderr.write(`[LazyBrain] Evolution error: ${evolutionError instanceof Error ? evolutionError.message : String(evolutionError)}\n`);
          }
        }
      } catch (err) {
        // Non-fatal: log but don't block session end
        process.stderr.write(`[LazyBrain] Usage tracking error: ${err instanceof Error ? err.message : String(err)}\n`);
      }
    }

    // Log session end to history (used by distillProfile for session completeness)
    appendHistory({
      timestamp: new Date().toISOString(),
      query: '',
      matched: '',
      accepted: true,
      layer: 'tag',
      sessionId,
      reason: 'stop',
    });

    // Update last-match to reflect session end
    writeLastMatch(null, 0);
    output({ continue: true });
    return;
  }

  const prompt = input.prompt?.trim();
  if (!prompt || prompt.length < 3) {
    output({ continue: true });
    return;
  }

  // no_graph 场景 — 先 loadConfig 再判断
  if (!existsSync(GRAPH_PATH)) {
    const config = loadConfig();
    if (config.mode === 'ask') {
      renderParchment({ type: 'no_graph' });
    }
    process.stderr.write('[LazyBrain] No graph found. Run `lazybrain scan && lazybrain compile` first.\n');
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
    const config = loadConfig();

    const history = loadRecentHistory(50);
    let profile: import('../src/types.js').UserProfile | undefined = undefined;
    try { profile = loadProfile() ?? undefined; } catch {}
    const result = await match(prompt, { graph, config, history, profile });

    if (result.matches.length === 0) {
      if (config.mode === 'ask') renderParchment({ type: 'no_match' });
      writeLastMatch(null, 0);
      output({ continue: true });
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
        ? formatWikiCard(card, top.score, secondary, { historyCount: histStats.count || undefined, historyAcceptRate: histStats.count > 0 ? histStats.acceptRate : undefined, nextSteps: result.nextSteps, proposals, strategy: config.strategy })
        : formatFallback(top, secondary, result.nextSteps, undefined, undefined, result.decisionHint);

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
      output({ continue: true, additionalSystemPrompt: text });
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
      output({ continue: true });
      return;
    }

    // ─── Low confidence (< 0.4) with API — try Secretary below, log if it rejects ───

    // ─── Layer 2: Secretary (score 0.4-0.85, or <0.4 with API) ───
    const secretaryApiBase = config.secretaryApiBase ?? config.compileApiBase;
    const secretaryApiKey = config.secretaryApiKey ?? config.compileApiKey;
    // Warn if base is set but key is missing — otherwise Secretary silently skipped
    if (secretaryApiBase && !secretaryApiKey) {
      process.stderr.write('[LazyBrain] WARNING: secretaryApiBase configured but secretaryApiKey missing. Secretary layer disabled.\n');
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
          output({ continue: true });
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
          const text = formatSecretaryInjection(secretaryResult, graph, history ?? [], result.nextSteps);

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
          output({ continue: true, additionalSystemPrompt: text });
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
        output({ continue: true });
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
        ? formatWikiCard(card, top.score, secondary, histStats2.count > 0 ? { historyCount: histStats2.count, historyAcceptRate: histStats2.acceptRate, nextSteps: result.nextSteps, proposals: proposals2, strategy: config.strategy } : { nextSteps: result.nextSteps, proposals: proposals2, strategy: config.strategy })
        : formatFallback(top, secondary, result.nextSteps, proposals2, config.strategy, result.decisionHint);

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
      output({ continue: true, additionalSystemPrompt: text });
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
    output({ continue: true });
  } catch (err: unknown) {
    const code = (err as { status?: number })?.status ?? 'ERR';
    const config = loadConfig();
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
    output({ continue: true });
  }
}

function output(data: HookOutput) {
  cleanupPid();
  process.stdout.write(JSON.stringify(data) + '\n');
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

function formatSecretaryInjection(
  resp: SecretaryResponse,
  graph: import('../src/graph/graph.js').Graph,
  history: import('../src/types.js').HistoryEntry[],
  nextSteps?: string[],
): string {
  const lines: string[] = [];

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

function formatFallback(
  top: { capability: { kind: string; name: string; scenario?: string }; score: number },
  secondary: Array<{ name: string; score: number }>,
  nextSteps?: string[],
  proposals?: ProposalOption[],
  strategy?: string,
  decisionHint?: { type: string; reason: string; suggestedTools: string[]; note: string },
): string {
  const pct = Math.round(top.score * 100);
  const lines: string[] = [];

  if (decisionHint) {
    lines.push(`## 🧠 决策类型：${decisionHint.type}`);
    lines.push('');
    lines.push(decisionHint.reason);
    lines.push('');
    lines.push('**建议考虑的工具组合**：');
    for (const tool of decisionHint.suggestedTools.slice(0, 4)) {
      lines.push(`- /${tool}`);
    }
    lines.push('');
    lines.push(`> ${decisionHint.note}`);
    lines.push('');
    lines.push('---');
    lines.push('');
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
  opts?: { reasoning?: string; historyCount?: number; historyAcceptRate?: number; secretaryPlan?: string; nextSteps?: string[]; proposals?: ProposalOption[]; strategy?: string },
): string {
  const cap = card.capability;
  const pct = Math.round(score * 100);
  const lines: string[] = [];

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

main();
