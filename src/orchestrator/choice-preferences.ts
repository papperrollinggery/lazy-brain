import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHOICE_PREFERENCES_PATH } from '../constants.js';
import type { ChoiceOption, ChoiceOptionKind, ChoiceSet } from '../types.js';

export type ChoiceFeedbackOutcome = 'accepted' | 'rejected';

export interface ChoicePreferenceStats {
  accepted: number;
  rejected: number;
  lastOutcome?: ChoiceFeedbackOutcome;
  lastUpdated?: string;
  kind?: ChoiceOptionKind;
}

export interface ChoicePreferenceProfile {
  version: 1;
  updatedAt: string;
  choices: Record<string, ChoicePreferenceStats>;
}

function emptyProfile(): ChoicePreferenceProfile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    choices: {},
  };
}

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export function loadChoicePreferences(path = CHOICE_PREFERENCES_PATH): ChoicePreferenceProfile {
  if (!existsSync(path)) return emptyProfile();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<ChoicePreferenceProfile>;
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      choices: parsed.choices && typeof parsed.choices === 'object' ? parsed.choices : {},
    };
  } catch {
    return emptyProfile();
  }
}

export function saveChoicePreferences(profile: ChoicePreferenceProfile, path = CHOICE_PREFERENCES_PATH): void {
  ensureParent(path);
  writeFileSync(path, JSON.stringify(profile, null, 2));
}

export function recordChoiceFeedback(input: {
  choiceId: string;
  outcome: ChoiceFeedbackOutcome;
  kind?: ChoiceOptionKind;
  path?: string;
}): ChoicePreferenceProfile {
  const choiceId = input.choiceId.trim();
  if (!choiceId) throw new Error('choiceId is required');
  const profile = loadChoicePreferences(input.path);
  const now = new Date().toISOString();
  const current = profile.choices[choiceId] ?? { accepted: 0, rejected: 0 };
  if (input.outcome === 'accepted') current.accepted++;
  else current.rejected++;
  current.lastOutcome = input.outcome;
  current.lastUpdated = now;
  if (input.kind) current.kind = input.kind;
  profile.choices[choiceId] = current;
  profile.updatedAt = now;
  saveChoicePreferences(profile, input.path);
  return profile;
}

function preferenceWeight(stats: ChoicePreferenceStats | undefined): number {
  if (!stats) return 0;
  const total = stats.accepted + stats.rejected;
  if (total < 2) return 0;
  return (stats.accepted - stats.rejected) / total;
}

function riskRank(value: ChoiceOption['risk']): number {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

function adjustedChoice(choice: ChoiceOption, profile: ChoicePreferenceProfile): ChoiceOption {
  const weight = preferenceWeight(profile.choices[choice.id]);
  if (weight === 0) return choice;
  const confidence = Math.max(0, Math.min(1, Math.round((choice.confidence + weight * 0.18) * 100) / 100));
  return {
    ...choice,
    confidence,
    reason: weight > 0
      ? `${choice.reason} Preference evidence increased this option.`
      : `${choice.reason} Preference evidence reduced this option.`,
  };
}

export function applyChoicePreferences(choiceSet: ChoiceSet, profile?: ChoicePreferenceProfile): ChoiceSet {
  if (!profile) return choiceSet;
  const recommended = adjustedChoice(choiceSet.recommended, profile);
  const alternatives = choiceSet.alternatives
    .map(choice => adjustedChoice(choice, profile))
    .sort((a, b) => b.confidence - a.confidence);
  const promotable = alternatives.find(choice =>
    choice.confidence >= recommended.confidence + 0.05 &&
    riskRank(choice.risk) <= riskRank(recommended.risk));

  if (!promotable) {
    return {
      ...choiceSet,
      recommended,
      alternatives,
    };
  }

  return {
    ...choiceSet,
    recommended: promotable,
    alternatives: [recommended, ...alternatives.filter(choice => choice.id !== promotable.id)],
  };
}
