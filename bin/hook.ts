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
import { GRAPH_PATH } from '../src/constants.js';
import { Graph } from '../src/graph/graph.js';
import { match } from '../src/matcher/matcher.js';
import { loadConfig } from '../src/config/config.js';
import { createEmbeddingProvider } from '../src/indexer/embeddings/provider.js';
import { askSecretary } from '../src/secretary/secretary.js';
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

async function main() {
  let input: HookInput = {};
  try {
    const raw = readFileSync('/dev/stdin', 'utf-8').trim();
    if (raw) input = JSON.parse(raw) as HookInput;
  } catch {
    // No stdin or invalid JSON — pass through
    output({ continue: true });
    return;
  }

  const prompt = input.prompt?.trim();
  if (!prompt || prompt.length < 3) {
    output({ continue: true });
    return;
  }

  // Skip if graph doesn't exist yet
  if (!existsSync(GRAPH_PATH)) {
    // Output hint to stderr so user knows what's happening
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

    const result = await match(prompt, { graph, config, embeddingProvider });

    if (result.matches.length === 0) {
      output({ continue: true });
      return;
    }

    const top = result.matches[0];
    const allNodes = graph.getAllNodes();

    // ─── Layer 0/1: High confidence (>= 0.85) — inject wiki card directly ───
    if (top.score >= 0.85) {
      const card = graph.getWikiCard(top.capability.id);
      const secondary = result.matches.slice(1, 3)
        .filter(m => m.score >= top.score * 0.8)
        .map(m => ({ name: m.capability.name, score: m.score }));
      const text = card
        ? formatWikiCard(card, top.score, secondary)
        : formatFallback(top, secondary);
      output({ continue: true, additionalSystemPrompt: text });
      return;
    }

    // ─── Low confidence (< 0.4) and no API — skip injection ───
    if (top.score < 0.4 && !config.compileApiBase) {
      output({ continue: true });
      return;
    }

    // ─── Layer 2: Secretary (score 0.4-0.85, or <0.4 with API) ───
    if (config.compileApiBase && config.compileApiKey) {
      const localMatches = result.matches.map(m => m.capability);
      const remaining = allNodes
        .filter(n => !localMatches.find(m => m.id === n.id))
        .filter(n => n.tier === undefined || n.tier <= 1);
      const candidates = [...localMatches, ...remaining];

      const secretaryResult = await askSecretary(prompt!, candidates, {
        apiBase: config.compileApiBase,
        apiKey: config.compileApiKey ?? '',
        model: config.compileModel,
      });

      if (secretaryResult) {
        const primaryNode = graph.findByName(secretaryResult.primary);
        if (primaryNode) {
          const card = graph.getWikiCard(primaryNode.id);
          const secondary = secretaryResult.secondary
            .map(name => graph.findByName(name))
            .filter((n): n is NonNullable<typeof n> => n !== null)
            .map(n => ({ name: n.name, score: secretaryResult.confidence * 0.9 }));

          const text = card
            ? formatWikiCard(card, secretaryResult.confidence, secondary) +
              `\n\n秘书分析: ${secretaryResult.plan}`
            : `[LazyBrain] 秘书推荐: /${secretaryResult.primary}\n${secretaryResult.plan}`;

          output({ continue: true, additionalSystemPrompt: text });
          return;
        }
      }
    }

    // ─── Fallback: local result (score 0.4-0.85, secretary failed) ───
    if (top.score >= 0.4) {
      const card = graph.getWikiCard(top.capability.id);
      const secondary = result.matches.slice(1, 3)
        .filter(m => m.score >= top.score * 0.8)
        .map(m => ({ name: m.capability.name, score: m.score }));
      const text = card
        ? formatWikiCard(card, top.score, secondary)
        : formatFallback(top, secondary);
      output({ continue: true, additionalSystemPrompt: text });
      return;
    }

    output({ continue: true });
  } catch {
    // Any error — pass through silently
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
