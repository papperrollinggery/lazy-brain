/**
 * LazyBrain — Tool Usage Tracker
 *
 * Parses Claude Code transcript JSONL to extract tool_use events,
 * enabling recommendation accuracy tracking.
 *
 * Claude Code transcript format:
 * - JSONL, each line has type: "user"|"assistant"|"system"
 * - tool_use events appear inside assistant entries as sub-elements
 */

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { LAZYBRAIN_DIR } from '../constants.js';

export const RECOMMENDATIONS_PATH = `${LAZYBRAIN_DIR}/recommendations.jsonl`;

export interface ToolUseEvent {
  sessionId: string;
  timestamp: string;
  toolName: string;    // e.g. "Bash", "Read", "Edit", "agent", "skill"
  subagent?: string;   // if toolName="agent", this is the subagent_type
  skillName?: string;   // if toolName="skill", this is the skill name
  prompt?: string;      // optional context from the tool invocation
}

export interface RecommendationEntry {
  sessionId: string;
  timestamp: string;
  query: string;
  recommended: string[]; // tools recommended by hook
  transcriptPath?: string;
}

/**
 * Parse a Claude Code transcript JSONL and extract all tool_use events.
 *
 * Claude Code emits tool_use as part of assistant entries, e.g.:
 *   { type: "assistant", tool_use: [{ name: "Bash", args: {...} }] }
 *   { type: "assistant", tool_use: [{ name: "Task", subagent_type: "executor" }] }
 *   { type: "assistant", tool_use: [{ name: "Skill", skill: "deep-interview" }] }
 */
export function parseTranscript(transcriptPath: string, sessionId: string): ToolUseEvent[] {
  const events: ToolUseEvent[] = [];

  try {
    if (!existsSync(transcriptPath)) {
      return events;
    }

    const raw = readFileSync(transcriptPath, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== 'assistant' && entry.type !== 'tool_use') continue;

        const messageContent = Array.isArray(entry.message?.content) ? entry.message.content : [];
        const contentToolUses = messageContent.filter((item: unknown): item is Record<string, unknown> =>
          Boolean(item && typeof item === 'object' && (item as { type?: unknown }).type === 'tool_use'),
        );
        const topLevelToolUses = entry.type === 'tool_use' ? [entry] : [];
        const toolList = [...topLevelToolUses, ...(entry.tool_use ?? []), ...contentToolUses];
        for (const tool of toolList) {
          if (!tool || typeof tool !== 'object') continue;

          const name: string = tool.name ?? tool.tool_name ?? '';
          if (!name) continue;
          const input = tool.input && typeof tool.input === 'object'
            ? tool.input as Record<string, unknown>
            : {};

          // Task(subagent_type="...") → toolName="agent", subagent
          if (name === 'Task' || name === 'task') {
            const subagent = tool.subagent_type ?? tool.subagent ?? input.subagent_type ?? input.subagent ?? '';
            events.push({
              sessionId,
              timestamp: entry.timestamp ?? new Date().toISOString(),
              toolName: 'agent',
              subagent: typeof subagent === 'string' ? subagent : '',
            });
            continue;
          }

          // Skill(skill="...") → toolName="skill", skillName
          if (name === 'Skill' || name === 'skill') {
            const skillName = tool.skill ?? tool.skillName ?? input.skill ?? input.skillName ?? input.name ?? '';
            events.push({
              sessionId,
              timestamp: entry.timestamp ?? new Date().toISOString(),
              toolName: 'skill',
              skillName: typeof skillName === 'string' ? skillName : '',
            });
            continue;
          }

          // All other tools: Bash, Read, Edit, Write, Glob, Grep, etc.
          events.push({
            sessionId,
            timestamp: entry.timestamp ?? new Date().toISOString(),
            toolName: name,
          });
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {}

  return events;
}

/**
 * Extract unique tool names from a list of ToolUseEvents.
 */
export function extractUsedTools(events: ToolUseEvent[]): string[] {
  const seen = new Set<string>();
  for (const e of events) {
    if (e.toolName === 'agent' && e.subagent) {
      seen.add(`agent:${e.subagent}`);
    } else if (e.toolName === 'skill' && e.skillName) {
      seen.add(`skill:${e.skillName}`);
    } else {
      seen.add(e.toolName);
    }
  }
  return [...seen];
}

/**
 * Write a recommendation entry to recommendations.jsonl.
 * Called from hook.ts when a match produces results.
 */
export function writeRecommendation(entry: RecommendationEntry): void {
  const line = JSON.stringify(entry);
  appendFileSync(RECOMMENDATIONS_PATH, line + '\n');
}

/**
 * Load all recommendation entries from recommendations.jsonl.
 */
export function loadRecommendations(): RecommendationEntry[] {
  if (!existsSync(RECOMMENDATIONS_PATH)) return [];
  try {
    const raw = readFileSync(RECOMMENDATIONS_PATH, 'utf-8');
    return raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as RecommendationEntry);
  } catch {
    return [];
  }
}

/**
 * Load recommendation entries for a specific session.
 */
export function loadRecommendationsForSession(sessionId: string): RecommendationEntry[] {
  return loadRecommendations().filter(e => e.sessionId === sessionId);
}
