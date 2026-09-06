import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

async function loadHistoryAt(path: string) {
  vi.resetModules();
  vi.doMock('../../src/constants.js', () => ({ HISTORY_PATH: path }));
  return import('../../src/history/history.js');
}

afterEach(() => {
  vi.doUnmock('../../src/constants.js');
});

describe('history usage statistics', () => {
  test('does not treat a recommendation as an adopted skill', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-history-'));
    const historyPath = join(dir, 'history.jsonl');
    writeFileSync(historyPath, [
      { timestamp: new Date().toISOString(), query: 'review', recommended: 'security-review', used: null, sessionId: 'one' },
      { timestamp: new Date().toISOString(), query: 'review', recommended: 'security-review', used: '', sessionId: 'one' },
      { timestamp: new Date().toISOString(), query: 'review', recommended: 'security-review', used: 'code-review', sessionId: 'one' },
    ].map(JSON.stringify).join('\n'));

    try {
      const { getStats, loadRecentHistory } = await loadHistoryAt(historyPath);
      expect(getStats()).toMatchObject({
        total: 3,
        accepted: 1,
        ignored: 2,
        bySkill: [{ skill: 'code-review', count: 1 }],
      });
      expect(loadRecentHistory()).toMatchObject([
        { matched: 'security-review', accepted: false, reason: 'low_score' },
        { matched: 'security-review', accepted: false, reason: 'low_score' },
        { matched: 'security-review', accepted: true, reason: 'matched' },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
