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

import { readFileSync, existsSync } from 'node:fs';
import { GRAPH_PATH, CAPABILITY_MODEL_HINTS } from '../src/constants.js';
import { Graph } from '../src/graph/graph.js';
import { match } from '../src/matcher/matcher.js';
import { loadConfig } from '../src/config/config.js';
import { createEmbeddingProvider } from '../src/indexer/embeddings/provider.js';
import { askSecretary } from '../src/secretary/secretary.js';
import { loadRecentHistory, appendHistory } from '../src/history/history.js';
import type { WikiCard } from '../src/types.js';

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
  | { type: 'new_tools'; count: number };

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
    const result = await match(prompt, { graph, config, embeddingProvider, history });

    if (result.matches.length === 0) {
      if (config.mode === 'ask') renderParchment({ type: 'no_match' });
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
      const text = card
        ? formatWikiCard(card, top.score, secondary)
        : formatFallback(top, secondary);

      appendHistory({
        timestamp: new Date().toISOString(),
        query: prompt,
        matched: top.capability.name,
        id: top.capability.id,
        accepted: true,
        layer: 'tag',
      });

      output({ continue: true, additionalSystemPrompt: text });
      return;
    }

    // ─── Low confidence (< 0.4) and no API — skip injection ───
    if (top.score < 0.4 && !config.compileApiBase) {
      if (config.mode === 'ask') renderParchment({ type: 'sleeping' });
      output({ continue: true });
      return;
    }

    // ─── Layer 2: Secretary (score 0.4-0.85, or <0.4 with API) ───
    if (config.compileApiBase && config.compileApiKey) {
      if (config.mode === 'ask') {
        renderParchment({ type: 'thinking', topTool: top.capability.name, score: top.score });
      }

      const localMatches = result.matches.map(m => m.capability);
      const remaining = allNodes
        .filter(n => !localMatches.find(m => m.id === n.id))
        .filter(n => n.tier === undefined || n.tier <= 1);
      const candidates = [...localMatches, ...remaining];

      const secretaryResult = await askSecretary(prompt, candidates, {
        apiBase: config.compileApiBase,
        apiKey: config.compileApiKey ?? '',
        model: config.compileModel,
      });

      if (secretaryResult) {
        if (config.mode === 'ask') {
          renderParchment({ type: 'secretary_done', tool: secretaryResult.primary, score: secretaryResult.confidence, plan: secretaryResult.plan });
        }

        const primaryNode = graph.findByName(secretaryResult.primary);
        if (primaryNode) {
          const card = graph.getWikiCard(primaryNode.id);
          const secondary = secretaryResult.secondary
            .map(name => graph.findByName(name))
            .filter((n): n is NonNullable<typeof n> => n !== null)
            .map(n => ({ name: n.name, score: secretaryResult.confidence * 0.9 }));

          const text = card
            ? formatWikiCard(card, secretaryResult.confidence, secondary) + `\n\n秘书分析: ${secretaryResult.plan}`
            : `[LazyBrain] 秘书推荐: /${secretaryResult.primary}\n${secretaryResult.plan}`;

          appendHistory({
            timestamp: new Date().toISOString(),
            query: prompt,
            matched: secretaryResult.primary,
            id: primaryNode.id,
            accepted: true,
            layer: 'llm',
          });

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
      const text = card
        ? formatWikiCard(card, top.score, secondary)
        : formatFallback(top, secondary);

      appendHistory({
        timestamp: new Date().toISOString(),
        query: prompt,
        matched: top.capability.name,
        id: top.capability.id,
        accepted: true,
        layer: 'tag',
      });

      output({ continue: true, additionalSystemPrompt: text });
      return;
    }

    if (config.mode === 'ask') renderParchment({ type: 'sleeping' });
    output({ continue: true });
  } catch (err: unknown) {
    const code = (err as { status?: number })?.status ?? 'ERR';
    const config = loadConfig();
    if (config.mode === 'ask') {
      renderParchment({ type: 'secretary_dead', code: String(code) });
    }
    output({ continue: true });
  }
}

function output(data: HookOutput) {
  process.stdout.write(JSON.stringify(data) + '\n');
}

function formatFallback(
  top: { capability: { kind: string; name: string; scenario?: string }; score: number },
  secondary: Array<{ name: string; score: number }>,
): string {
  const lines = [
    `[LazyBrain] 推荐: ${top.capability.kind}/${top.capability.name} (${Math.round(top.score * 100)}%)`,
  ];
  if (top.capability.scenario) lines.push(`  适用场景: ${top.capability.scenario}`);
  if (secondary.length > 0) {
    lines.push(`  备选: ${secondary.map(m => `/${m.name}`).join(', ')}`);
  }
  return lines.join('\n');
}

function formatWikiCard(card: WikiCard, score: number, secondaryMatches: Array<{ name: string; score: number }>): string {
  const cap = card.capability;
  const pct = Math.round(score * 100);
  const lines: string[] = [];

  lines.push(`[LazyBrain] 推荐方案 (${pct}% 置信度)`);
  lines.push('');
  lines.push(`主力工具: /${cap.name}`);
  if (cap.scenario) {
    lines.push(`  适用场景: ${cap.scenario}`);
  }
  lines.push(`  调用方式: Skill tool "${cap.name}" 或 /${cap.name}`);

  if (card.composesWith.length > 0) {
    lines.push('');
    lines.push('推荐组合:');
    for (const c of card.composesWith.slice(0, 3)) {
      lines.push(`  /${cap.name} + /${c.capability.name} — ${c.reason}`);
    }
  }

  if (card.similarTo.length > 0) {
    lines.push('');
    lines.push('相似工具对比:');
    for (const c of card.similarTo.slice(0, 3)) {
      if (c.diff) {
        lines.push(`  vs /${c.capability.name}: ${c.diff}`);
      }
    }
  }

  if (card.dependsOn.length > 0) {
    lines.push('');
    lines.push('前置条件:');
    for (const d of card.dependsOn.slice(0, 3)) {
      const desc = d.capability.description?.slice(0, 50) ?? '';
      lines.push(`  /${d.capability.name}${desc ? ` — ${desc}` : ''}`);
    }
  }

  if (secondaryMatches.length > 0) {
    lines.push('');
    const altList = secondaryMatches.map(m => `/${m.name} (${Math.round(m.score * 100)}%)`).join(', ');
    lines.push(`备选: ${altList}`);
  }

  lines.push('');
  lines.push('如果用户意图与上述工具匹配，请直接调用推荐的 skill。');

  return lines.join('\n');
}

main();
