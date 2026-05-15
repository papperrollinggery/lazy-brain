#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Graph } from '../src/graph/graph.js';
import { GRAPH_PATH, LAZYBRAIN_DIR } from '../src/constants.js';
import { find } from '../src/matcher/matcher.js';
import { orchestrate, formatOrchestrationHint } from '../src/orchestrator/engine.js';
import { signalFromHook } from '../src/orchestrator/signals.js';

interface HookInput {
  hook_event_name?: string;
  event?: string;
  prompt?: string;
  user_prompt?: string;
  session_id?: string;
}

interface LastMatch {
  tool: string;
  score: number;
  timestamp: string;
}

function readInput(): HookInput | null {
  try {
    const raw = readFileSync(0, 'utf-8').trim();
    if (!raw) return null;
    return JSON.parse(raw) as HookInput;
  } catch {
    return null;
  }
}

function eventName(input: HookInput): string {
  return input.hook_event_name ?? input.event ?? '';
}

function promptText(input: HookInput): string {
  return (input.prompt ?? input.user_prompt ?? '').trim();
}

function respond(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function writeLastMatch(match: LastMatch): void {
  const path = join(LAZYBRAIN_DIR, 'last-match.json');
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(match, null, 2));
}

function shouldHandle(input: HookInput, prompt: string): boolean {
  const event = eventName(input);
  if (event && event !== 'UserPromptSubmit') return false;
  return prompt.length >= 3;
}

function main(): void {
  const input = readInput();
  if (!input) {
    respond({ continue: true });
    return;
  }

  const prompt = promptText(input);
  if (!shouldHandle(input, prompt) || !existsSync(GRAPH_PATH)) {
    respond({ continue: true });
    return;
  }

  const graph = Graph.load(GRAPH_PATH);
  if (graph.getNodeCount() === 0) {
    respond({ continue: true });
    return;
  }

  const plan = orchestrate(signalFromHook(input), { autoActivate: false });
  if (plan && plan.confidence >= 0.8) {
    writeLastMatch({
      tool: plan.enhancements[0]?.name ?? 'combo',
      score: plan.confidence,
      timestamp: new Date().toISOString(),
    });
    respond({ continue: true, systemMessage: formatOrchestrationHint(plan) });
    return;
  }

  const [top] = find(prompt, { graph, limit: 1, threshold: 0.75 });
  if (!top) {
    respond({ continue: true });
    return;
  }

  writeLastMatch({ tool: top.skill, score: top.score, timestamp: new Date().toISOString() });
  respond({
    continue: true,
    systemMessage: `💡 Try /${top.skill} for this task (${Math.round(top.score * 100)}% match)`,
  });
}

main();
