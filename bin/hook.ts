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

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GRAPH_PATH, CAPABILITY_MODEL_HINTS, LAZYBRAIN_DIR } from '../src/constants.js';
import { Graph } from '../src/graph/graph.js';
import { match } from '../src/matcher/matcher.js';
import { loadConfig } from '../src/config/config.js';
import { createEmbeddingProvider } from '../src/indexer/embeddings/provider.js';
import { askSecretary, buildHistoryHints } from '../src/secretary/secretary.js';
import { loadRecentHistory, appendHistory } from '../src/history/history.js';
import { loadProfile, isProfileStale, distillAndSave } from '../src/history/profile.js';
import { trackSessionUsage } from '../src/history/usage.js';
import { evolveCapabilities } from '../src/evolution/evolve.js';
import type { WikiCard, SecretaryResponse } from '../src/types.js';

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

async function main() {
  let input: HookInput = {};
  try {
    const raw = readFileSync('/dev/stdin', 'utf-8').trim();
    if (raw) input = JSON.parse(raw) as HookInput;
  } catch {
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
          // Trigger evolution based on new usage data
          evolveCapabilities({ auto: true });
        }
      } catch (err) {
        // Non-fatal: log but don't block session end
        process.stderr.write(`[LazyBrain] Usage tracking error: ${err instanceof Error ? err.message : String(err)}\n`);
      }
    }

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
    writeLastMatch(null, 0);
    output({ continue: true });
    return;
  }

  try {
    const graph = Graph.loadMetaOnly(GRAPH_PATH);
    const config = loadConfig();

    const embeddingProvider = (config.engine === 'embedding' || config.engine === 'hybrid') && config.embeddingApiKey
      ? createEmbeddingProvider({
          apiBase: config.embeddingApiBase ?? 'https://api.siliconflow.cn/v1',
          apiKey: config.embeddingApiKey,
          model: config.embeddingModel ?? 'BAAI/bge-m3',
        })
      : undefined;

    const history = loadRecentHistory(50);
    let profile: import('../src/types.js').UserProfile | undefined = undefined;
    try { profile = loadProfile() ?? undefined; } catch {}
    const result = await match(prompt, { graph, config, embeddingProvider, history, profile });

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
      const text = card
        ? formatWikiCard(card, top.score, secondary, { historyCount: histStats.count || undefined, historyAcceptRate: histStats.count > 0 ? histStats.acceptRate : undefined, nextSteps: result.nextSteps })
        : formatFallback(top, secondary, result.nextSteps);

      appendHistory({
        timestamp: new Date().toISOString(),
        query: prompt,
        matched: top.capability.name,
        id: top.capability.id,
        accepted: true,
        layer: top.layer,
        sessionId: process.env.CLAUDE_SESSION_ID ?? 'unknown',
        candidateList: result.matches.slice(0, 3).map(m => m.capability.name),
      });

      writeLastMatch(top.capability.name, top.score, top.historyBoost);
      output({ continue: true, additionalSystemPrompt: text });
      return;
    }

    // ─── Low confidence (< 0.4) and no API — skip injection ───
    if (top.score < 0.4 && !(config.compileApiBase && config.compileApiKey)) {
      if (config.mode === 'ask') renderParchment({ type: 'sleeping' });
      writeLastMatch(top.capability.name, top.score, top.historyBoost);
      output({ continue: true });
      return;
    }

    // ─── Layer 2: Secretary (score 0.4-0.85, or <0.4 with API) ───
    const secretaryApiBase = config.secretaryApiBase ?? config.embeddingApiBase ?? config.compileApiBase;
    const secretaryApiKey = config.secretaryApiKey ?? config.embeddingApiKey ?? config.compileApiKey;
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
        apiBase: config.secretaryApiBase ?? config.embeddingApiBase ?? config.compileApiBase ?? '',
        apiKey: config.secretaryApiKey ?? config.embeddingApiKey ?? config.compileApiKey ?? '',
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
          const text = formatSecretaryInjection(secretaryResult, graph, history ?? []);

          appendHistory({
            timestamp: new Date().toISOString(),
            query: prompt,
            matched: primaryAction!,
            id: primaryNode.id,
            accepted: true,
            layer: 'llm',
            sessionId: process.env.CLAUDE_SESSION_ID ?? 'unknown',
            candidateList: secretaryResult.tasks.slice(0, 3).map(t => t.action),
          });

          writeLastMatch(primaryAction!, secretaryResult.confidence);
          output({ continue: true, additionalSystemPrompt: text });
          return;
        }
      } else {
        // Secretary failed
        if (config.mode === 'ask') {
          renderParchment({ type: 'secretary_dead', code: 'null', fallbackTool: top.capability.name, fallbackScore: top.score });
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
      const text = card
        ? formatWikiCard(card, top.score, secondary, histStats2.count > 0 ? { historyCount: histStats2.count, historyAcceptRate: histStats2.acceptRate, nextSteps: result.nextSteps } : { nextSteps: result.nextSteps })
        : formatFallback(top, secondary, result.nextSteps);

      appendHistory({
        timestamp: new Date().toISOString(),
        query: prompt,
        matched: top.capability.name,
        id: top.capability.id,
        accepted: true,
        layer: top.layer,
        sessionId: process.env.CLAUDE_SESSION_ID ?? 'unknown',
        candidateList: result.matches.slice(0, 3).map(m => m.capability.name),
      });

      writeLastMatch(top.capability.name, top.score, top.historyBoost);
      output({ continue: true, additionalSystemPrompt: text });
      return;
    }

    if (config.mode === 'ask') renderParchment({ type: 'sleeping' });
    writeLastMatch(null, 0);
    output({ continue: true });
  } catch (err: unknown) {
    const code = (err as { status?: number })?.status ?? 'ERR';
    const config = loadConfig();
    if (config.mode === 'ask') {
      renderParchment({ type: 'secretary_dead', code: String(code) });
    }
    writeLastMatch(null, 0);
    output({ continue: true });
  }
}

function output(data: HookOutput) {
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
): string {
  const lines: string[] = [];
  lines.push('<lazybrain-recommendation>');

  lines.push(`<intent>${resp.intent}</intent>`);

  // Mode proposal: 非 regular 模式注入 XML 块
  if (resp.mode && resp.mode !== 'regular') {
    lines.push('<mode-proposal>');
    lines.push(`  推荐模式: ${resp.mode.toUpperCase()}`);
    if (resp.modeReason) lines.push(`  理由: ${resp.modeReason}`);
    lines.push('  编排方案:');
    for (const task of resp.tasks.slice(0, 4)) {
      lines.push(`    • ${task.action}(${task.model ?? 'sonnet'}) — ${task.reason}`);
    }
    lines.push('  请用户确认执行模式，或输入其他方式。');
    lines.push('</mode-proposal>');
  }

  if (resp.tasks.length > 0) {
    lines.push('<tasks>');
    for (let i = 0; i < resp.tasks.length; i++) {
      const t = resp.tasks[i];
      const modelHint = t.model ? ` (${t.model})` : '';
      const dep = t.after ? ` [after: ${t.after}]` : '';
      lines.push(`  ${i + 1}. 调用 Skill tool skill="${t.action}"${modelHint}${dep} — ${t.reason}`);
    }
    lines.push('</tasks>');
  }

  // Context: history + reasoning
  const ctxLines: string[] = [];
  if (resp.tasks.length > 0) {
    const primaryStats = getHistoryStats(history, resp.tasks[0].action);
    if (primaryStats.count > 0) {
      ctxLines.push(`用户历史: ${resp.tasks[0].action} 使用 ${primaryStats.count} 次，接受率 ${Math.round(primaryStats.acceptRate * 100)}%`);
    }
  }
  if (resp.reasoning) ctxLines.push(`分析: ${resp.reasoning}`);
  if (resp.plan) ctxLines.push(`方案: ${resp.plan}`);

  if (ctxLines.length > 0) {
    lines.push('<context>');
    for (const l of ctxLines) lines.push(`  ${l}`);
    lines.push('</context>');
  }

  lines.push('</lazybrain-recommendation>');
  return lines.join('\n');
}

function formatFallback(
  top: { capability: { kind: string; name: string; scenario?: string }; score: number },
  secondary: Array<{ name: string; score: number }>,
  nextSteps?: string[],
): string {
  const lines = [
    `[LazyBrain] 推荐: ${top.capability.kind}/${top.capability.name} (${Math.round(top.score * 100)}%)`,
  ];
  if (top.capability.scenario) lines.push(`  适用场景: ${top.capability.scenario}`);
  if (secondary.length > 0) {
    lines.push(`  备选: ${secondary.map(m => `/${m.name}`).join(', ')}`);
  }
  if (nextSteps && nextSteps.length > 0) {
    lines.push(`  下一步: ${nextSteps.map(s => `/${s}`).join(' → ')}`);
  }
  return lines.join('\n');
}

function formatWikiCard(
  card: WikiCard,
  score: number,
  secondaryMatches: Array<{ name: string; score: number }>,
  opts?: { reasoning?: string; historyCount?: number; historyAcceptRate?: number; secretaryPlan?: string; nextSteps?: string[] },
): string {
  const cap = card.capability;
  const pct = Math.round(score * 100);
  const lines: string[] = [];

  // ─── Intent analysis ───
  lines.push('<lazybrain-recommendation>');

  // Intent block: what LazyBrain understood
  const intentParts: string[] = [];
  if (cap.scenario) intentParts.push(cap.scenario);
  if (opts?.reasoning) intentParts.push(opts.reasoning);
  if (intentParts.length > 0) {
    lines.push('<intent>');
    for (const p of intentParts) lines.push(`  ${p}`);
    lines.push('</intent>');
  }

  // Action block: direct instruction to Claude
  lines.push('<action>');
  lines.push(`  调用 Skill tool，参数 skill="${cap.name}"。`);
  lines.push(`  置信度 ${pct}%${opts?.historyCount ? `，用户历史使用 ${opts.historyCount} 次` : ''}${opts?.historyAcceptRate !== undefined ? `，接受率 ${Math.round(opts.historyAcceptRate * 100)}%` : ''}.`);
  lines.push('</action>');

  // Context block: why this tool
  const ctxLines: string[] = [];
  if (card.composesWith.length > 0) {
    const combos = card.composesWith.slice(0, 2).map(c => `/${cap.name} + /${c.capability.name} (${c.reason})`).join('; ');
    ctxLines.push(`推荐组合: ${combos}`);
  }
  if (card.dependsOn.length > 0) {
    const deps = card.dependsOn.slice(0, 2).map(d => `/${d.capability.name}`).join(', ');
    ctxLines.push(`前置条件: ${deps}`);
  }
  if (opts?.secretaryPlan) {
    ctxLines.push(`分析: ${opts.secretaryPlan}`);
  }
  if (opts?.nextSteps && opts.nextSteps.length > 0) {
    ctxLines.push(`下一步: ${opts.nextSteps.map(s => `/${s}`).join(' → ')}`);
  }
  if (ctxLines.length > 0) {
    lines.push('<context>');
    for (const l of ctxLines) lines.push(`  ${l}`);
    lines.push('</context>');
  }

  // Alternatives block
  const altParts: string[] = [];
  if (card.similarTo.length > 0) {
    for (const c of card.similarTo.slice(0, 2)) {
      if (c.diff) altParts.push(`/${c.capability.name} — ${c.diff}`);
    }
  }
  if (secondaryMatches.length > 0) {
    for (const m of secondaryMatches) {
      if (!altParts.find(a => a.startsWith(`/${m.name}`))) {
        altParts.push(`/${m.name} (${Math.round(m.score * 100)}%)`);
      }
    }
  }
  if (altParts.length > 0) {
    lines.push('<alternatives>');
    for (const a of altParts) lines.push(`  ${a}`);
    lines.push('</alternatives>');
  }

  lines.push('</lazybrain-recommendation>');
  return lines.join('\n');
}

main();
