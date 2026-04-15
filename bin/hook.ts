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

    // Only inject if confidence is reasonable
    if (top.score < 0.4) {
      output({ continue: true });
      return;
    }

    const lines: string[] = [];

    // Primary match
    lines.push(`[LazyBrain] Relevant capability detected:`);
    lines.push(`  ${top.capability.kind}/${top.capability.name} (${Math.round(top.score * 100)}% match)`);
    lines.push(`  ${top.capability.description}`);

    if (top.capability.filePath) {
      lines.push(`  File: ${top.capability.filePath}`);
    }

    if (top.capability.scenario) {
      lines.push(`  When to use: ${top.capability.scenario}`);
    }

    // Secondary matches (if score is close)
    const secondary = result.matches.slice(1, 3).filter(m => m.score >= top.score * 0.8);
    if (secondary.length > 0) {
      lines.push(`  Also consider: ${secondary.map(m => m.capability.name).join(', ')}`);
    }

    // Compositions
    if (result.compositions.length > 0) {
      const c = result.compositions[0];
      const names = c.capabilities.map((cap: { name: string }) => cap.name).join(' + ');
      lines.push(`  Combo: ${names} — ${c.reason}`);
    }

    output({
      continue: true,
      additionalSystemPrompt: lines.join('\n'),
    });
  } catch {
    // Any error — pass through silently
    output({ continue: true });
  }
}

function output(data: HookOutput) {
  process.stdout.write(JSON.stringify(data) + '\n');
}

main();
