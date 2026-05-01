import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyChoicePreferences, clearChoicePreferences, loadChoicePreferences, recordChoiceFeedback } from '../../src/orchestrator/choice-preferences.js';
import type { ChoiceSet } from '../../src/types.js';

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

function tempPath(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'lazybrain-choice-'));
  return join(tempDir, 'prefs.json');
}

function choiceSet(): ChoiceSet {
  return {
    intent: 'test',
    recommended: {
      id: 'model:balanced',
      kind: 'model',
      label: 'Balanced coding model',
      confidence: 0.7,
      cost: 'medium',
      latency: 'normal',
      risk: 'low',
      reason: 'Default.',
    },
    alternatives: [
      {
        id: 'model:strong-reasoning',
        kind: 'model',
        label: 'Stronger reasoning model',
        confidence: 0.62,
        cost: 'high',
        latency: 'slow',
        risk: 'low',
        reason: 'Deep review.',
      },
      {
        id: 'mode:autopilot',
        kind: 'mode',
        label: 'Autopilot',
        confidence: 0.68,
        cost: 'high',
        latency: 'slow',
        risk: 'high',
        reason: 'Autonomous loop.',
      },
    ],
    conflicts: [],
    policy: {
      defaultAction: 'auto',
      askUser: false,
      reason: 'Use default.',
    },
  };
}

describe('choice preferences', () => {
  it('records accepted and rejected feedback without raw prompt data', () => {
    const path = tempPath();
    recordChoiceFeedback({ choiceId: 'model:strong-reasoning', outcome: 'accepted', kind: 'model', path });
    const profile = recordChoiceFeedback({ choiceId: 'model:strong-reasoning', outcome: 'rejected', kind: 'model', path });

    expect(profile.choices['model:strong-reasoning']).toMatchObject({
      accepted: 1,
      rejected: 1,
      kind: 'model',
      lastOutcome: 'rejected',
    });
    expect(JSON.stringify(profile)).not.toContain('query');
    expect(loadChoicePreferences(path).choices['model:strong-reasoning'].accepted).toBe(1);
  });

  it('promotes a safer preferred alternative without changing policy', () => {
    const profile = {
      version: 1 as const,
      updatedAt: new Date().toISOString(),
      choices: {
        'model:strong-reasoning': { accepted: 4, rejected: 0 },
      },
    };

    const adjusted = applyChoicePreferences(choiceSet(), profile);

    expect(adjusted.recommended.id).toBe('model:strong-reasoning');
    expect(adjusted.policy.askUser).toBe(false);
  });

  it('does not promote a riskier alternative over a safer recommendation', () => {
    const profile = {
      version: 1 as const,
      updatedAt: new Date().toISOString(),
      choices: {
        'mode:autopilot': { accepted: 5, rejected: 0 },
      },
    };

    const adjusted = applyChoicePreferences(choiceSet(), profile);

    expect(adjusted.recommended.id).toBe('model:balanced');
    expect(adjusted.alternatives.find(choice => choice.id === 'mode:autopilot')?.confidence).toBeGreaterThan(0.68);
  });

  it('clears one choice or all choices without storing prompt data', () => {
    const path = tempPath();
    recordChoiceFeedback({ choiceId: 'model:strong-reasoning', outcome: 'accepted', kind: 'model', path });
    recordChoiceFeedback({ choiceId: 'mode:review', outcome: 'accepted', kind: 'mode', path });

    const oneCleared = clearChoicePreferences({ choiceId: 'mode:review', path });

    expect(oneCleared.choices['mode:review']).toBeUndefined();
    expect(oneCleared.choices['model:strong-reasoning']?.accepted).toBe(1);
    expect(JSON.stringify(oneCleared)).not.toContain('query');

    const allCleared = clearChoicePreferences({ path });

    expect(allCleared.choices).toEqual({});
    expect(loadChoicePreferences(path).choices).toEqual({});
  });
});
