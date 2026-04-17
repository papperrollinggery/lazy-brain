import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseTranscript, extractUsedTools } from '../../src/history/tool-usage-tracker.js';
import type { ToolUseEvent } from '../../src/history/tool-usage-tracker.js';

const tmp = mkdtempSync(join(tmpdir(), 'lb-test-'));
const transcriptPath = join(tmp, 'transcript.jsonl');

afterAll(() => {
  try { rmSync(tmp, { recursive: true }); } catch {}
});

function writeTranscript(lines: string[]) {
  writeFileSync(transcriptPath, lines.join('\n') + '\n', 'utf-8');
}

describe('parseTranscript', () => {
  it('returns empty array for non-existent file', () => {
    const events = parseTranscript('/nonexistent/path.jsonl', 'session-x');
    expect(events).toEqual([]);
  });

  it('extracts Bash tool_use events', () => {
    writeTranscript([
      JSON.stringify({ type: 'assistant', timestamp: '2025-01-01T00:00:00Z', tool_use: [{ name: 'Bash', args: { command: 'ls' } }] }),
    ]);
    const events = parseTranscript(transcriptPath, 'session-x');
    expect(events).toHaveLength(1);
    expect(events[0].toolName).toBe('Bash');
    expect(events[0].sessionId).toBe('session-x');
  });

  it('extracts Read tool_use events', () => {
    writeTranscript([
      JSON.stringify({ type: 'assistant', timestamp: '2025-01-01T00:00:00Z', tool_use: [{ name: 'Read', args: { filePath: '/foo/bar.ts' } }] }),
    ]);
    const events = parseTranscript(transcriptPath, 'session-x');
    expect(events).toHaveLength(1);
    expect(events[0].toolName).toBe('Read');
  });

  it('extracts Edit tool_use events', () => {
    writeTranscript([
      JSON.stringify({ type: 'assistant', timestamp: '2025-01-01T00:00:00Z', tool_use: [{ name: 'Edit', args: {} }] }),
    ]);
    const events = parseTranscript(transcriptPath, 'session-x');
    expect(events).toHaveLength(1);
    expect(events[0].toolName).toBe('Edit');
  });

  it('normalizes Task(subagent) to agent:<subagent>', () => {
    writeTranscript([
      JSON.stringify({ type: 'assistant', timestamp: '2025-01-01T00:00:00Z', tool_use: [{ name: 'Task', subagent_type: 'executor' }] }),
    ]);
    const events = parseTranscript(transcriptPath, 'session-x');
    expect(events).toHaveLength(1);
    expect(events[0].toolName).toBe('agent');
    expect(events[0].subagent).toBe('executor');
  });

  it('normalizes Skill(skill) to skill:<name>', () => {
    writeTranscript([
      JSON.stringify({ type: 'assistant', timestamp: '2025-01-01T00:00:00Z', tool_use: [{ name: 'Skill', skill: 'deep-interview' }] }),
    ]);
    const events = parseTranscript(transcriptPath, 'session-x');
    expect(events).toHaveLength(1);
    expect(events[0].toolName).toBe('skill');
    expect(events[0].skillName).toBe('deep-interview');
  });

  it('skips non-assistant entries', () => {
    writeTranscript([
      JSON.stringify({ type: 'user', content: 'hello' }),
      JSON.stringify({ type: 'system', content: 'system prompt' }),
    ]);
    const events = parseTranscript(transcriptPath, 'session-x');
    expect(events).toEqual([]);
  });

  it('skips malformed JSON lines', () => {
    writeTranscript([
      'not valid json',
      JSON.stringify({ type: 'assistant', timestamp: '2025-01-01T00:00:00Z', tool_use: [{ name: 'Bash', args: {} }] }),
    ]);
    const events = parseTranscript(transcriptPath, 'session-x');
    expect(events).toHaveLength(1);
    expect(events[0].toolName).toBe('Bash');
  });

  it('extracts multiple tool_use events from a single assistant entry', () => {
    writeTranscript([
      JSON.stringify({
        type: 'assistant',
        timestamp: '2025-01-01T00:00:00Z',
        tool_use: [
          { name: 'Bash', args: {} },
          { name: 'Read', args: {} },
          { name: 'Edit', args: {} },
        ],
      }),
    ]);
    const events = parseTranscript(transcriptPath, 'session-x');
    expect(events).toHaveLength(3);
    expect(events.map(e => e.toolName)).toEqual(['Bash', 'Read', 'Edit']);
  });

  it('extracts events from multiple assistant entries', () => {
    writeTranscript([
      JSON.stringify({ type: 'assistant', timestamp: '2025-01-01T00:00:00Z', tool_use: [{ name: 'Bash', args: {} }] }),
      JSON.stringify({ type: 'assistant', timestamp: '2025-01-01T00:01:00Z', tool_use: [{ name: 'Task', subagent_type: 'explore' }] }),
    ]);
    const events = parseTranscript(transcriptPath, 'session-x');
    expect(events).toHaveLength(2);
    expect(events[0].toolName).toBe('Bash');
    expect(events[1].toolName).toBe('agent');
    expect(events[1].subagent).toBe('explore');
  });
});

describe('extractUsedTools', () => {
  it('returns unique tool names', () => {
    const events: ToolUseEvent[] = [
      { sessionId: 's1', timestamp: '2025-01-01T00:00:00Z', toolName: 'Bash' },
      { sessionId: 's1', timestamp: '2025-01-01T00:01:00Z', toolName: 'Bash' },
      { sessionId: 's1', timestamp: '2025-01-01T00:02:00Z', toolName: 'Read' },
    ];
    const tools = extractUsedTools(events);
    expect(tools).toHaveLength(2);
    expect(tools).toContain('Bash');
    expect(tools).toContain('Read');
  });

  it('formats agent events as agent:<subagent>', () => {
    const events: ToolUseEvent[] = [
      { sessionId: 's1', timestamp: '2025-01-01T00:00:00Z', toolName: 'agent', subagent: 'executor' },
    ];
    const tools = extractUsedTools(events);
    expect(tools).toEqual(['agent:executor']);
  });

  it('formats skill events as skill:<name>', () => {
    const events: ToolUseEvent[] = [
      { sessionId: 's1', timestamp: '2025-01-01T00:00:00Z', toolName: 'skill', skillName: 'deep-interview' },
    ];
    const tools = extractUsedTools(events);
    expect(tools).toEqual(['skill:deep-interview']);
  });

  it('returns empty array for empty events', () => {
    const tools = extractUsedTools([]);
    expect(tools).toEqual([]);
  });
});
