import type { HistoryEntry } from '../history/history.js';

export interface WorkflowPattern {
  sequence: string[];
  count: number;
  suggestion?: string;
}

const HIGH_VALUE = [
  'tdd-workflow',
  'security-review',
  'code-review',
  'ship',
  'frontend-design',
  'investigate',
  'docs',
  'ci-cd-best-practices',
];

function usedSkill(entry: HistoryEntry): string | null {
  return entry.used?.trim() || null;
}

export function detectPatterns(history: HistoryEntry[]): WorkflowPattern[] {
  const counts = new Map<string, number>();
  const bySession = new Map<string, HistoryEntry[]>();
  for (const entry of history) {
    const session = bySession.get(entry.sessionId) ?? [];
    session.push(entry);
    bySession.set(entry.sessionId, session);
  }
  for (const sessionHistory of bySession.values()) {
    const adopted = sessionHistory
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      .map(usedSkill)
      .filter((skill): skill is string => skill !== null);
    for (let i = 0; i <= adopted.length - 3; i++) {
      const sequence = adopted.slice(i, i + 3);
      if (new Set(sequence).size < 2) continue;
      const key = sequence.join(' -> ');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([key, count]) => {
      const sequence = key.split(' -> ');
      const suggestion = `Try a combo for ${sequence.join(' + ')}`;
      return { sequence, count, suggestion };
    })
    .sort((a, b) => b.count - a.count);
}

export function unusedHighValue(history: HistoryEntry[], allSkills: string[] = HIGH_VALUE): string[] {
  const used = new Set(history.map(usedSkill).filter((name): name is string => name !== null));
  return allSkills.filter((skill) => !used.has(skill)).slice(0, 5);
}

export function learnedSignals(history: HistoryEntry[]): Array<{ trigger: string; sequence: string[]; confidence: number }> {
  return detectPatterns(history)
    .filter((pattern) => pattern.count >= 3)
    .map((pattern) => ({
      trigger: pattern.sequence[0],
      sequence: pattern.sequence,
      confidence: Math.min(0.95, 0.55 + pattern.count * 0.1),
    }));
}
